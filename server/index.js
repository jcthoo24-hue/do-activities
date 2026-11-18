const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { db, dbPath, initSchema } = require('./db');
const { seedDatabase, STAGE_A_DEFAULT, STAGE_B_DEFAULT, STAGE_C_DEFAULT, addDays, uid } = require('./seed');

// Initialize database and seed default data
initSchema();
seedDatabase();

function logAudit(user, eventId, moduleName, action, details) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, user_name, role_id, event_id, module, action, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid('aud'),
      user ? user.id : 'system',
      user ? user.name : '系统',
      user ? user.role_id : 'system',
      eventId || '',
      moduleName,
      action,
      typeof details === 'string' ? details : JSON.stringify(details)
    );
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

function getUserFromReq(req) {
  const userId = req.headers['x-user-id'] || 'u-admin';
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (user) return user;
  return db.prepare('SELECT * FROM users WHERE id = ?').get('u-admin');
}

function canViewFinance(user, event) {
  if (!user) return false;
  if (user.role_id === 'admin') return true;
  if (user.can_view_finance === 1) return true;
  if (event && event.leader_id === user.id && user.role_id === 'leader') return true;
  return false;
}

function canViewSensitiveContacts(user, event) {
  if (!user) return false;
  if (user.role_id === 'admin') return true;
  if (user.can_view_sensitive_contacts === 1) return true;
  if (event && event.leader_id === user.id) return true;
  return false;
}

function canApprove(user, event) {
  if (!user) return false;
  if (user.role_id === 'admin') return true;
  if (user.role_id === 'leader' && (!event || event.leader_id === user.id)) return true;
  return false;
}

function generateNextEventCode(year, month) {
  const mm = String(month).padStart(2, '0');
  const prefix = `EVT-${year}-${mm}-`;
  const existing = db.prepare(`SELECT event_code FROM events WHERE event_code LIKE ? ORDER BY event_code DESC LIMIT 1`).get(`${prefix}%`);
  if (!existing) {
    return `${prefix}001`;
  }
  const parts = existing.event_code.split('-');
  const lastSeq = parseInt(parts[3] || '0', 10);
  return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
}

function computeEventSummaryAndRisks(event) {
  const today = new Date().toISOString().slice(0, 10);
  const items = db.prepare('SELECT * FROM event_checklist_items WHERE event_id = ? ORDER BY stage ASC, sort_order ASC').all(event.id);
  const totalItems = items.length;
  const completedItems = items.filter(i => i.is_checked === 1 || i.status === '已完成').length;
  const applicableItems = items.filter(i => i.status !== '不适用').length;
  const uncompletedItems = items.filter(i => i.is_checked === 0 && i.status !== '已完成' && i.status !== '不适用').length;
  const overdueItems = items.filter(i => i.is_checked === 0 && i.status !== '已完成' && i.status !== '不适用' && i.due_date && i.due_date < today).length;
  const pendingApprovalItems = items.filter(i => i.approval_status === '待审核' || i.status === '待审核').length;
  const completionPct = applicableItems > 0 ? Math.round((completedItems / applicableItems) * 100) : 0;

  // Required checklist items uncompleted
  const uncompletedRequiredChecklist = items.filter(i => i.is_required === 1 && i.is_checked === 0 && i.status !== '已完成' && i.status !== '不适用');

  // Materials check
  const materials = db.prepare('SELECT * FROM event_material_requirements WHERE event_id = ?').all(event.id);
  const unreadyCriticalMaterials = materials.filter(m => m.is_critical === 1 && m.step_ready === 0);
  const unpurchasedMaterials = materials.filter(m => m.need_purchase_qty > 0 && m.step_ordered === 0);
  const overdueMaterials = materials.filter(m => m.need_purchase_qty > 0 && m.step_arrived === 0 && m.expected_arrival_date && m.expected_arrival_date < today);

  // Tasks unacknowledged
  const tasks = db.prepare('SELECT * FROM tasks WHERE event_id = ?').all(event.id);
  const unackTasks = tasks.filter(t => t.is_acknowledged === 0 && t.status === '未开始');

  // Registrations count
  const regStats = db.prepare(`
    SELECT
      COUNT(*) as total_reg,
      SUM(CASE WHEN status = '已报名' THEN 1 ELSE 0 END) as active_reg,
      SUM(CASE WHEN attended = 1 THEN 1 ELSE 0 END) as attended_count,
      SUM(CASE WHEN student_type = '非本院生' AND status = '已报名' THEN 1 ELSE 0 END) as external_reg,
      SUM(CASE WHEN student_type = '非本院生' AND attended = 1 THEN 1 ELSE 0 END) as external_attended,
      SUM(CASE WHEN student_type = '非本院生' AND converted_to_course = 1 THEN 1 ELSE 0 END) as external_converted,
      SUM(CASE WHEN status = '已报名' THEN paid_rm ELSE 0 END) as total_paid_rm
    FROM registrations WHERE event_id = ?
  `).get(event.id);

  const activeRegistrations = regStats.active_reg || 0;
  const totalPaidIncome = regStats.total_paid_rm || 0;

  // Budget & Expenses
  const budget = db.prepare('SELECT * FROM budgets WHERE event_id = ?').get(event.id);
  const totalMaterialCost = materials.reduce((sum, m) => sum + (Number(m.final_actual_cost) || 0), 0);
  let actualTotalCost = totalMaterialCost;
  if (budget) {
    actualTotalCost =
      totalMaterialCost +
      (Number(budget.actual_transport_rm) || 0) +
      (Number(budget.actual_venue_rm) || 0) +
      (Number(budget.actual_catering_rm) || 0) +
      (Number(budget.actual_prize_rm) || 0) +
      (Number(budget.actual_marketing_rm) || 0) +
      (Number(budget.actual_other_rm) || 0);
  }

  // Missing critical readiness count
  const criticalUnfinishedCount = uncompletedRequiredChecklist.length + unreadyCriticalMaterials.length;

  // Risk warnings (Section 18.2)
  const risks = [];
  if (unpurchasedMaterials.length > 0) {
    risks.push({ type: 'material_unbought', level: 'danger', title: `材料尚未购买 (${unpurchasedMaterials.length}项)`, detail: unpurchasedMaterials.map(m => m.name).join('、') });
  }
  if (overdueMaterials.length > 0) {
    risks.push({ type: 'material_overdue', level: 'danger', title: `材料到货逾期 (${overdueMaterials.length}项)`, detail: overdueMaterials.map(m => `${m.name}(预计${m.expected_arrival_date})`).join('、') });
  }
  if (unreadyCriticalMaterials.length > 0) {
    risks.push({ type: 'material_unready', level: 'warning', title: `关键材料未准备齐全 (${unreadyCriticalMaterials.length}项)`, detail: unreadyCriticalMaterials.map(m => m.name).join('、') });
  }
  if (uncompletedRequiredChecklist.length > 0) {
    risks.push({ type: 'critical_task_incomplete', level: 'warning', title: `关键SOP任务未完成 (${uncompletedRequiredChecklist.length}项)`, detail: `仍有 ${criticalUnfinishedCount} 项关键准备未完成` });
  }
  if (overdueItems > 0) {
    risks.push({ type: 'task_overdue', level: 'danger', title: `逾期检查项 (${overdueItems}项)`, detail: '请立即督促相关负责老师跟进完成' });
  }
  if (pendingApprovalItems > 0) {
    risks.push({ type: 'pending_approval', level: 'warning', title: `等待主管审核项目 (${pendingApprovalItems}项)`, detail: '老师已提交完成，请主管或负责人核对确认' });
  }
  if (unackTasks.length > 0) {
    risks.push({ type: 'teacher_unconfirmed', level: 'info', title: `老师尚未确认/开始任务 (${unackTasks.length}项)`, detail: '部分指派任务尚未开始执行' });
  }
  if (activeRegistrations < (event.min_students || 1) && event.status !== '已结束' && event.status !== '已归档') {
    risks.push({ type: 'low_registration', level: 'danger', title: `报名人数低于最低开办要求 (${activeRegistrations}/${event.min_students}人)`, detail: '需加强阶段A电话与家长群邀约推广' });
  }
  if (actualTotalCost > (event.budget_rm || 0) && (event.budget_rm || 0) > 0) {
    risks.push({ type: 'over_budget', level: 'danger', title: `实际成本超出活动总预算 (RM ${actualTotalCost.toFixed(2)} / RM ${Number(event.budget_rm).toFixed(2)})`, detail: `超支 RM ${(actualTotalCost - event.budget_rm).toFixed(2)}` });
  }

  // Stage C completion check
  const stageCItems = items.filter(i => i.stage === 'C');
  const stageCCompleted = stageCItems.length > 0 && stageCItems.every(i => i.is_checked === 1 || i.status === '已完成' || i.status === '不适用');

  return {
    totalItems,
    completedItems,
    uncompletedItems,
    overdueItems,
    pendingApprovalItems,
    completionPct,
    criticalUnfinishedCount,
    uncompletedRequiredChecklistCount: uncompletedRequiredChecklist.length,
    unreadyCriticalMaterialsCount: unreadyCriticalMaterials.length,
    isReadyToStart: criticalUnfinishedCount === 0 || !!event.readiness_override_reason,
    activeRegistrations,
    attendedCount: regStats.attended_count || 0,
    externalReg: regStats.external_reg || 0,
    externalAttended: regStats.external_attended || 0,
    externalConverted: regStats.external_converted || 0,
    totalPaidIncome,
    totalMaterialCost,
    actualTotalCost,
    netBalanceRm: totalPaidIncome - actualTotalCost,
    stageCCompleted,
    risks
  };
}

function recalculateMaterialRequirement(reqData, expectedStudents) {
  const qtyPerStudent = Number(reqData.qty_per_student) || 0;
  const fixedExtra = Number(reqData.fixed_extra_qty) || 0;
  const expStudents = Number(expectedStudents !== undefined ? expectedStudents : reqData.expected_students) || 0;
  const safetyBuffer = Number(reqData.safety_buffer_qty) || 0;

  // Formula: 材料所需数量 = 每人数量 × 预计人数 ＋ 固定数量 ＋ 备用数量
  const totalRequiredQty = Number((qtyPerStudent * expStudents + fixedExtra + safetyBuffer).toFixed(2));
  const currentStockAvailable = Number(reqData.current_stock_available) || 0;
  // Formula: 采购数量 = 所需数量 − 可用库存 (如果结果小于0，显示0)
  const needPurchaseQty = Math.max(0, Number((totalRequiredQty - currentStockAvailable).toFixed(2)));

  const plan = reqData.pricing_plan || 'actual';
  const originalPrice = Number(reqData.original_price) || 0;
  const airPrice = Number(reqData.air_freight_price) || 0;
  const seaPrice = Number(reqData.sea_freight_price) || 0;
  let unitPrice = Number(reqData.unit_price) || 0;
  if (plan === 'original' && originalPrice > 0) unitPrice = originalPrice;
  if (plan === 'air' && airPrice > 0) unitPrice = airPrice;
  if (plan === 'sea' && seaPrice > 0) unitPrice = seaPrice;

  const shippingFee = Number(reqData.shipping_fee) || 0;
  const finalActualCost = needPurchaseQty > 0 ? Number((needPurchaseQty * unitPrice + shippingFee).toFixed(2)) : 0;

  return {
    totalRequiredQty,
    needPurchaseQty,
    unitPrice,
    finalActualCost,
    expectedStudents: expStudents
  };
}

function syncBudgetCosts(eventId) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return;
  const mats = db.prepare('SELECT SUM(final_actual_cost) as total_mat FROM event_material_requirements WHERE event_id = ?').get(eventId);
  const regs = db.prepare("SELECT SUM(paid_rm) as total_paid FROM registrations WHERE event_id = ? AND status = '已报名'").get(eventId);
  const exps = db.prepare('SELECT category, SUM(amount_rm) as total_amt FROM expenses WHERE event_id = ? GROUP BY category').all(eventId);

  const matCost = Number(mats?.total_mat || 0);
  const paidIncome = Number(regs?.total_paid || 0);

  let budget = db.prepare('SELECT * FROM budgets WHERE event_id = ?').get(eventId);
  if (!budget) {
    db.prepare(`
      INSERT INTO budgets (id, event_id, expected_income_rm, actual_income_rm, material_budget_rm, actual_material_cost_rm)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uid('bdg'), eventId, (event.expected_students || 0) * (event.fee_rm || 0), paidIncome, (event.budget_rm || 0) * 0.4, matCost);
    budget = db.prepare('SELECT * FROM budgets WHERE event_id = ?').get(eventId);
  } else {
    db.prepare(`
      UPDATE budgets SET actual_income_rm = ?, actual_material_cost_rm = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?
    `).run(paidIncome, matCost, eventId);
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 20 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

async function handleApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query || {};
  const method = req.method;
  const currentUser = getUserFromReq(req);

  try {
    // 1. Auth & Users & Roles
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const user = db.prepare('SELECT * FROM users WHERE username = ? AND status = ?').get(body.username, 'active');
      if (!user || (body.password && user.password !== body.password)) {
        return sendJson(res, 401, { error: '用户名或密码错误' });
      }
      logAudit(user, '', '登录系统', '用户登录', `账号 ${user.username} (${user.name}) 登录成功`);
      return sendJson(res, 200, { user });
    }

    if (pathname === '/api/users' && method === 'GET') {
      const users = db.prepare('SELECT id, username, name, role_id, branch, phone, email, avatar_color, can_view_finance, can_view_sensitive_contacts, status, created_at FROM users ORDER BY created_at ASC').all();
      const roles = db.prepare('SELECT * FROM roles').all();
      return sendJson(res, 200, { users, roles, currentUser });
    }

    if (pathname === '/api/users' && method === 'POST') {
      if (currentUser.role_id !== 'admin') {
        return sendJson(res, 403, { error: '权限不足：只有 Admin／院长 可以新增或管理老师账户' });
      }
      const body = await parseBody(req);
      if (!body.username || !body.name) {
        return sendJson(res, 400, { error: '请填写完整的账号与姓名' });
      }
      const id = uid('u');
      db.prepare(`
        INSERT INTO users (id, username, password, name, role_id, branch, phone, email, avatar_color, can_view_finance, can_view_sensitive_contacts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, body.username, body.password || '5plus1', body.name, body.role_id || 'teacher',
        body.branch || '总院 Main Branch', body.phone || '', body.email || '',
        body.avatar_color || '#C8102E', body.can_view_finance ? 1 : 0, body.can_view_sensitive_contacts ? 1 : 0
      );
      logAudit(currentUser, '', '老师与权限管理', '新增老师账户', `新增账户: ${body.name} (${body.role_id})`);
      const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      return sendJson(res, 201, { user: created });
    }

    if (pathname.startsWith('/api/users/') && method === 'PUT') {
      if (currentUser.role_id !== 'admin') {
        return sendJson(res, 403, { error: '权限不足：只有 Admin／院长 可以修改老师权限' });
      }
      const targetId = pathname.split('/')[3];
      const body = await parseBody(req);
      db.prepare(`
        UPDATE users SET
          name = COALESCE(?, name),
          role_id = COALESCE(?, role_id),
          branch = COALESCE(?, branch),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          can_view_finance = COALESCE(?, can_view_finance),
          can_view_sensitive_contacts = COALESCE(?, can_view_sensitive_contacts),
          status = COALESCE(?, status)
        WHERE id = ?
      `).run(
        body.name ?? null,
        body.role_id ?? null,
        body.branch ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.can_view_finance !== undefined ? (body.can_view_finance ? 1 : 0) : null,
        body.can_view_sensitive_contacts !== undefined ? (body.can_view_sensitive_contacts ? 1 : 0) : null,
        body.status ?? null,
        targetId
      );
      logAudit(currentUser, '', '老师与权限管理', '更新老师权限', `更新用户 ${targetId}`);
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
      return sendJson(res, 200, { user: updated });
    }

    // 2. Templates Management
    if (pathname === '/api/templates' && method === 'GET') {
      const templates = db.prepare('SELECT * FROM event_templates ORDER BY created_at ASC').all();
      const templatesWithItems = templates.map(t => {
        const items = db.prepare('SELECT * FROM checklist_templates WHERE template_id = ? ORDER BY stage ASC, sort_order ASC').all(t.id);
        return { ...t, items };
      });
      return sendJson(res, 200, { templates: templatesWithItems });
    }

    if (pathname === '/api/templates' && method === 'POST') {
      const body = await parseBody(req);
      const tplId = uid('tpl');
      const code = body.code || `CUSTOM_${Date.now().toString().slice(-5)}`;
      db.prepare(`
        INSERT INTO event_templates (id, name, code, category, description, default_schedules_json, default_materials_json, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tplId, body.name || '新自定义SOP模板', code, body.category || '其他自定义活动',
        body.description || '', JSON.stringify(body.schedules || []), JSON.stringify(body.materials || []), currentUser.id
      );

      // If saving from an existing event or items list
      const insertChkTpl = db.prepare(`
        INSERT INTO checklist_templates (id, template_id, stage, sort_order, title, category_tag, days_offset, is_required, allow_repeat, default_repeats_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      if (body.from_event_id) {
        const evItems = db.prepare('SELECT * FROM event_checklist_items WHERE event_id = ? ORDER BY stage ASC, sort_order ASC').all(body.from_event_id);
        evItems.forEach(item => {
          insertChkTpl.run(uid('ct'), tplId, item.stage, item.sort_order, item.title, item.category_tag, item.days_offset, item.is_required, item.allow_repeat, '[]');
        });
      } else if (Array.isArray(body.items) && body.items.length > 0) {
        body.items.forEach((item, idx) => {
          insertChkTpl.run(uid('ct'), tplId, item.stage || 'A', item.sort_order || (idx + 1), item.title, item.category_tag || '自定义SOP', item.days_offset || 0, item.is_required ? 1 : 0, item.allow_repeat ? 1 : 0, '[]');
        });
      } else {
        STAGE_A_DEFAULT.forEach(i => insertChkTpl.run(uid('ct'), tplId, 'A', i.sort, i.title, i.tag, i.offset, i.req, i.repeat, '[]'));
        STAGE_B_DEFAULT.forEach(i => insertChkTpl.run(uid('ct'), tplId, 'B', i.sort, i.title, i.tag, i.offset, i.req, i.repeat, '[]'));
        STAGE_C_DEFAULT.forEach(i => insertChkTpl.run(uid('ct'), tplId, 'C', i.sort, i.title, i.tag, i.offset, i.req, i.repeat, '[]'));
      }

      logAudit(currentUser, body.from_event_id || '', 'SOP模板管理', '创建SOP模板', `保存模板：${body.name}`);
      return sendJson(res, 201, { id: tplId, message: 'SOP模板已成功保存' });
    }

    if (pathname.startsWith('/api/templates/') && pathname.endsWith('/items') && method === 'POST') {
      const tplId = pathname.split('/')[3];
      const body = await parseBody(req);
      const id = uid('ct');
      db.prepare(`
        INSERT INTO checklist_templates (id, template_id, stage, sort_order, title, category_tag, days_offset, is_required, allow_repeat, default_repeats_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tplId, body.stage || 'A', body.sort_order || 99, body.title,
        body.category_tag || '自定义SOP', Number(body.days_offset) || 0,
        body.is_required !== undefined ? (body.is_required ? 1 : 0) : 1,
        body.allow_repeat ? 1 : 0, '[]'
      );
      return sendJson(res, 201, { id });
    }

    if (pathname.startsWith('/api/template-items/') && method === 'DELETE') {
      const itemId = pathname.split('/')[3];
      db.prepare('DELETE FROM checklist_templates WHERE id = ?').run(itemId);
      return sendJson(res, 200, { deleted: true });
    }

    // 3. Events List, Search, Create, Detail, Update, Copy, Delete
    if (pathname === '/api/events' && method === 'GET') {
      let sql = 'SELECT * FROM events WHERE 1=1';
      const params = [];

      if (query.year) { sql += ' AND year = ?'; params.push(Number(query.year)); }
      if (query.month) { sql += ' AND month = ?'; params.push(Number(query.month)); }
      if (query.category) { sql += ' AND category = ?'; params.push(query.category); }
      if (query.leader_id) { sql += ' AND leader_id = ?'; params.push(query.leader_id); }
      if (query.status) { sql += ' AND status = ?'; params.push(query.status); }
      if (query.branch) { sql += ' AND branch = ?'; params.push(query.branch); }
      if (query.location) { sql += ' AND location LIKE ?'; params.push(`%${query.location}%`); }
      if (query.grade) { sql += ' AND target_grades LIKE ?'; params.push(`%${query.grade}%`); }
      if (query.search) {
        sql += ' AND (name LIKE ? OR event_code LIKE ? OR theme LIKE ? OR location LIKE ?)';
        params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`, `%${query.search}%`);
      }

      sql += ' ORDER BY start_date DESC, created_at DESC';
      const rows = db.prepare(sql).all(...params);
      const usersMap = {};
      db.prepare('SELECT id, name, avatar_color, role_id FROM users').all().forEach(u => { usersMap[u.id] = u; });

      const enriched = rows.map(ev => {
        const summary = computeEventSummaryAndRisks(ev);
        return {
          ...ev,
          target_grades: JSON.parse(ev.target_grades || '[]'),
          assistant_ids: JSON.parse(ev.assistant_ids || '[]'),
          milestone_nodes: JSON.parse(ev.milestone_nodes_json || '{}'),
          leader_name: usersMap[ev.leader_id]?.name || '未指定',
          summary
        };
      });

      if (query.mine === '1') {
        const myEvents = enriched.filter(ev => {
          if (ev.leader_id === currentUser.id) return true;
          if (ev.assistant_ids.includes(currentUser.id)) return true;
          const hasAssignedTask = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE event_id = ? AND assignee_id = ?').get(ev.id, currentUser.id).c > 0;
          return hasAssignedTask;
        });
        return sendJson(res, 200, { events: myEvents });
      }

      return sendJson(res, 200, { events: enriched });
    }

    if (pathname === '/api/events/next-code' && method === 'GET') {
      const year = Number(query.year) || 2026;
      const month = Number(query.month) || 11;
      return sendJson(res, 200, { event_code: generateNextEventCode(year, month) });
    }

    if (pathname === '/api/events' && method === 'POST') {
      if (currentUser.role_id === 'teacher') {
        return sendJson(res, 403, { error: '权限不足：只有 Admin／院长 或 活动负责人 可以建立新活动' });
      }
      const body = await parseBody(req);
      if (!body.name || !body.start_date) {
        return sendJson(res, 400, { error: '请填写活动名称与活动开始日期' });
      }

      const startDate = body.start_date;
      const endDate = body.end_date || startDate;
      const dateParts = startDate.split('-');
      const year = Number(body.year) || Number(dateParts[0]) || 2026;
      const month = Number(body.month) || Number(dateParts[1]) || 11;
      const eventId = uid('evt');
      const eventCode = generateNextEventCode(year, month);

      const milestoneNodes = body.milestone_nodes || {
        promo_start: addDays(startDate, -30),
        check_reg_procure: addDays(startDate, -14),
        check_arrival_flow: addDays(startDate, -7),
        final_check: addDays(startDate, -1),
        event_day: startDate,
        followup_review: addDays(startDate, 7)
      };

      const leaderId = body.leader_id || currentUser.id;
      const assistantIds = Array.isArray(body.assistant_ids) ? body.assistant_ids : [];
      const targetGrades = Array.isArray(body.target_grades) ? body.target_grades : ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
      const templateId = body.template_id || 'tpl-counter-sop';

      db.prepare(`
        INSERT INTO events (
          id, event_code, name, theme, category, year, month, start_date, end_date, start_time, end_time,
          location, branch, target_grades, age_range, leader_id, assistant_ids,
          expected_students, min_students, actual_students, fee_rm, budget_rm,
          purpose, goals, description, precautions, poster_url, internal_notes,
          status, template_id, milestone_nodes_json, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventId, eventCode, body.name, body.theme || '', body.category || '假期活动',
        year, month, startDate, endDate, body.start_time || '13:00', body.end_time || '16:00',
        body.location || '总院礼堂', body.branch || '总院 Main Branch',
        JSON.stringify(targetGrades), body.age_range || '7-12岁',
        leaderId, JSON.stringify(assistantIds),
        Number(body.expected_students) || 50, Number(body.min_students) || 20, Number(body.actual_students) || 0,
        Number(body.fee_rm) || 0, Number(body.budget_rm) || 1000,
        body.purpose || '', body.goals || '', body.description || '', body.precautions || '',
        body.poster_url || '', body.internal_notes || '',
        body.status || '筹备中', templateId, JSON.stringify(milestoneNodes), currentUser.id
      );

      // Generate Checklist & Synchronized Tasks from chosen template
      let tplItems = db.prepare('SELECT * FROM checklist_templates WHERE template_id = ? ORDER BY stage ASC, sort_order ASC').all(templateId);
      if (tplItems.length === 0 && templateId !== 'tpl-blank') {
        tplItems = db.prepare('SELECT * FROM checklist_templates WHERE template_id = ? ORDER BY stage ASC, sort_order ASC').all('tpl-counter-sop');
      }

      const insertItem = db.prepare(`
        INSERT INTO event_checklist_items (
          id, event_id, stage, sort_order, title, category_tag, assignee_id, due_date, days_offset,
          status, is_checked, is_required, allow_repeat, repeat_records_json, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, '待提交')
      `);

      const insertTask = db.prepare(`
        INSERT INTO tasks (
          id, event_id, checklist_item_id, title, content, stage, assignee_id, assistant_ids,
          start_date, due_date, priority, status, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '未开始', '待提交')
      `);

      tplItems.forEach(item => {
        const chkId = uid('chk');
        const dueDate = addDays(startDate, item.days_offset || 0);
        const defaultRepeats = item.allow_repeat ? [
          { round: '第一次发布/执行', date: addDays(startDate, -25), assignee: '', result: '', completed: false },
          { round: '第二次发布/执行', date: addDays(startDate, -14), assignee: '', result: '', completed: false },
          { round: '第三次发布/执行', date: addDays(startDate, -5), assignee: '', result: '', completed: false }
        ] : [];

        insertItem.run(
          chkId, eventId, item.stage, item.sort_order, item.title, item.category_tag,
          leaderId, dueDate, item.days_offset || 0, '未开始', item.is_required, item.allow_repeat, JSON.stringify(defaultRepeats)
        );

        insertTask.run(
          uid('tsk'), eventId, chkId, item.title, `[${body.name}] 阶段${item.stage} SOP任务：${item.title}`,
          item.stage, leaderId, JSON.stringify(assistantIds), addDays(dueDate, -3), dueDate,
          item.is_required ? '高' : '中'
        );
      });

      // Generate Default Run of Show Schedules
      const tplObj = db.prepare('SELECT * FROM event_templates WHERE id = ?').get(templateId);
      const defaultScheds = tplObj ? JSON.parse(tplObj.default_schedules_json || '[]') : [];
      const insertSched = db.prepare(`
        INSERT INTO event_schedules (id, event_id, sort_order, start_time, end_time, title, assignee_id, materials_needed, venue, instructions, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '未开始')
      `);
      defaultScheds.forEach((s, idx) => {
        insertSched.run(uid('ros'), eventId, idx + 1, s.start_time, s.end_time, s.title, leaderId, s.materials_needed || '', s.venue || body.location || '主会场', s.instructions || '');
      });

      // Generate 4 Default Counter SOP Marketing Sources
      const insertSrc = db.prepare(`
        INSERT INTO marketing_sources (id, event_id, source_name, sort_order, assignee_id)
        VALUES (?, ?, ?, ?, ?)
      `);
      ['Send Phonebank', 'Send 停补生', '本院兄弟姐妹', '小老板'].forEach((name, idx) => {
        insertSrc.run(uid('src'), eventId, name, idx + 1, leaderId);
      });

      // Initialize Budget Record
      syncBudgetCosts(eventId);

      logAudit(currentUser, eventId, '活动建立', '新建活动', `创建活动：${body.name} (${eventCode})`);
      const createdEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      return sendJson(res, 201, { event: createdEvent });
    }

    // Copy Existing Event into New Event (Section 12.3)
    if (pathname.match(/^\/api\/events\/[^/]+\/copy$/) && method === 'POST') {
      const sourceEventId = pathname.split('/')[3];
      const sourceEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(sourceEventId);
      if (!sourceEvent) return sendJson(res, 404, { error: '原活动不存在' });

      const body = await parseBody(req);
      const newStartDate = body.start_date || addDays(sourceEvent.start_date, 365);
      const newEndDate = body.end_date || newStartDate;
      const dateParts = newStartDate.split('-');
      const newYear = Number(body.year) || Number(dateParts[0]);
      const newMonth = Number(body.month) || Number(dateParts[1]);
      const newEventId = uid('evt');
      const newEventCode = generateNextEventCode(newYear, newMonth);
      const newName = body.name || `${sourceEvent.name} (${newYear}版)`;
      const newLeaderId = body.leader_id || sourceEvent.leader_id;
      const newBudgetRm = body.budget_rm !== undefined ? Number(body.budget_rm) : sourceEvent.budget_rm;
      const newExpectedStudents = body.expected_students !== undefined ? Number(body.expected_students) : sourceEvent.expected_students;

      const milestoneNodes = {
        promo_start: addDays(newStartDate, -30),
        check_reg_procure: addDays(newStartDate, -14),
        check_arrival_flow: addDays(newStartDate, -7),
        final_check: addDays(newStartDate, -1),
        event_day: newStartDate,
        followup_review: addDays(newStartDate, 7)
      };

      db.prepare(`
        INSERT INTO events (
          id, event_code, name, theme, category, year, month, start_date, end_date, start_time, end_time,
          location, branch, target_grades, age_range, leader_id, assistant_ids,
          expected_students, min_students, actual_students, fee_rm, budget_rm,
          purpose, goals, description, precautions, poster_url, internal_notes,
          status, followup_completed, template_id, copied_from_event_id,
          level1_name, level1_definition, level1_target, level2_name, level2_definition, level2_target,
          milestone_nodes_json, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, '筹备中', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newEventId, newEventCode, newName, sourceEvent.theme, sourceEvent.category,
        newYear, newMonth, newStartDate, newEndDate, sourceEvent.start_time, sourceEvent.end_time,
        sourceEvent.location, sourceEvent.branch, sourceEvent.target_grades, sourceEvent.age_range,
        newLeaderId, sourceEvent.assistant_ids, newExpectedStudents, sourceEvent.min_students,
        sourceEvent.fee_rm, newBudgetRm, sourceEvent.purpose, sourceEvent.goals,
        sourceEvent.description, sourceEvent.precautions, sourceEvent.poster_url,
        `复制自历史活动：${sourceEvent.name} (${sourceEvent.event_code})`,
        sourceEvent.template_id, sourceEvent.id,
        sourceEvent.level1_name, sourceEvent.level1_definition, sourceEvent.level1_target,
        sourceEvent.level2_name, sourceEvent.level2_definition, sourceEvent.level2_target,
        JSON.stringify(milestoneNodes), currentUser.id
      );

      // Copy SOP Checklist Items with ALL completion statuses RESET!
      const oldItems = db.prepare('SELECT * FROM event_checklist_items WHERE event_id = ? ORDER BY stage ASC, sort_order ASC').all(sourceEventId);
      const insertItem = db.prepare(`
        INSERT INTO event_checklist_items (
          id, event_id, stage, sort_order, title, category_tag, assignee_id, due_date, days_offset,
          status, is_checked, is_required, allow_repeat, repeat_records_json, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '未开始', 0, ?, ?, ?, '待提交')
      `);
      const insertTask = db.prepare(`
        INSERT INTO tasks (
          id, event_id, checklist_item_id, title, content, stage, assignee_id, assistant_ids,
          start_date, due_date, priority, status, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '未开始', '待提交')
      `);

      oldItems.forEach(item => {
        const chkId = uid('chk');
        const dueDate = addDays(newStartDate, item.days_offset || 0);
        const resetRepeats = item.allow_repeat ? [
          { round: '第一次发布/执行', date: addDays(newStartDate, -25), assignee: '', result: '', completed: false },
          { round: '第二次发布/执行', date: addDays(newStartDate, -14), assignee: '', result: '', completed: false },
          { round: '第三次发布/执行', date: addDays(newStartDate, -5), assignee: '', result: '', completed: false }
        ] : [];

        insertItem.run(
          chkId, newEventId, item.stage, item.sort_order, item.title, item.category_tag,
          newLeaderId, dueDate, item.days_offset || 0, item.is_required, item.allow_repeat, JSON.stringify(resetRepeats)
        );
        insertTask.run(
          uid('tsk'), newEventId, chkId, item.title, `[${newName}] 阶段${item.stage} SOP任务：${item.title}`,
          item.stage, newLeaderId, sourceEvent.assistant_ids, addDays(dueDate, -3), dueDate,
          item.is_required ? '高' : '中'
        );
      });

      // Copy Run of Show Schedules (reset completion)
      const oldScheds = db.prepare('SELECT * FROM event_schedules WHERE event_id = ? ORDER BY sort_order ASC').all(sourceEventId);
      const insertSched = db.prepare(`
        INSERT INTO event_schedules (id, event_id, sort_order, start_time, end_time, title, assignee_id, materials_needed, venue, instructions, precautions, status, is_completed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '未开始', 0)
      `);
      oldScheds.forEach(s => {
        insertSched.run(uid('ros'), newEventId, s.sort_order, s.start_time, s.end_time, s.title, newLeaderId, s.materials_needed, s.venue, s.instructions, s.precautions);
      });

      // Copy Material Templates (reset procurement steps, recalculate for new expected students)
      const oldMats = db.prepare('SELECT * FROM event_material_requirements WHERE event_id = ?').all(sourceEventId);
      const insertMatReq = db.prepare(`
        INSERT INTO event_material_requirements (
          id, event_id, material_id, name, purpose, buyer_id, category, unit,
          qty_per_student, fixed_extra_qty, expected_students, safety_buffer_qty,
          total_required_qty, current_stock_available, need_purchase_qty,
          pricing_plan, unit_price, original_price, air_freight_price, sea_freight_price, shipping_fee, final_actual_cost,
          supplier_name, purchase_link, procurement_status, is_critical
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待确认', ?)
      `);
      oldMats.forEach(m => {
        const calc = recalculateMaterialRequirement(m, newExpectedStudents);
        insertMatReq.run(
          uid('req'), newEventId, m.material_id, m.name, m.purpose, newLeaderId, m.category, m.unit,
          m.qty_per_student, m.fixed_extra_qty, newExpectedStudents, m.safety_buffer_qty,
          calc.totalRequiredQty, m.current_stock_available, calc.needPurchaseQty,
          m.pricing_plan, m.unit_price, m.original_price, m.air_freight_price, m.sea_freight_price, m.shipping_fee, calc.finalActualCost,
          m.supplier_name, m.purchase_link, m.is_critical
        );
      });

      // Initialize fresh Marketing Sources (NOT copying old student registrations/payments!)
      const insertSrc = db.prepare('INSERT INTO marketing_sources (id, event_id, source_name, sort_order, assignee_id) VALUES (?, ?, ?, ?, ?)');
      ['Send Phonebank', 'Send 停补生', '本院兄弟姐妹', '小老板'].forEach((name, idx) => {
        insertSrc.run(uid('src'), newEventId, name, idx + 1, newLeaderId);
      });

      syncBudgetCosts(newEventId);
      logAudit(currentUser, newEventId, '复制旧活动', '复制为新活动', `从 ${sourceEvent.event_code} 复制创建新活动 ${newEventCode}`);

      const newEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(newEventId);
      return sendJson(res, 201, { event: newEvent });
    }

    // Event Full Detail Endpoint
    if (pathname.match(/^\/api\/events\/[^/]+$/) && method === 'GET') {
      const eventId = pathname.split('/')[3];
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!event) return sendJson(res, 404, { error: '找不到该活动档案' });

      const usersMap = {};
      db.prepare('SELECT id, name, role_id, branch, avatar_color FROM users').all().forEach(u => { usersMap[u.id] = u; });

      const checklistItems = db.prepare('SELECT * FROM event_checklist_items WHERE event_id = ? ORDER BY stage ASC, sort_order ASC').all(eventId).map(item => ({
        ...item,
        repeat_records: JSON.parse(item.repeat_records_json || '[]'),
        assignee_name: usersMap[item.assignee_id]?.name || '未分配',
        completed_by_name: usersMap[item.completed_by]?.name || item.completed_by || '',
        reviewer_name: usersMap[item.reviewer_id]?.name || item.reviewer_id || ''
      }));

      // Protect sensitive student/parent records in Stage C if user has no permission
      const hasSensitiveAccess = canViewSensitiveContacts(currentUser, event);
      const hasFinanceAccess = canViewFinance(currentUser, event);

      const tasks = db.prepare('SELECT * FROM tasks WHERE event_id = ? ORDER BY due_date ASC, priority DESC').all(eventId).map(t => ({
        ...t,
        assistant_ids: JSON.parse(t.assistant_ids || '[]'),
        assignee_name: usersMap[t.assignee_id]?.name || '未分配'
      }));

      const materials = db.prepare('SELECT * FROM event_material_requirements WHERE event_id = ? ORDER BY created_at ASC').all(eventId).map(m => ({
        ...m,
        buyer_name: usersMap[m.buyer_id]?.name || '未分配'
      }));

      const schedules = db.prepare('SELECT * FROM event_schedules WHERE event_id = ? ORDER BY sort_order ASC, start_time ASC').all(eventId).map(s => ({
        ...s,
        assignee_name: usersMap[s.assignee_id]?.name || '未分配'
      }));

      const registrations = db.prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC').all(eventId).map(r => ({
        ...r,
        parent_phone: hasSensitiveAccess ? r.parent_phone : (r.parent_phone ? r.parent_phone.slice(0, 4) + '-****' + r.parent_phone.slice(-2) : '***权限保护***')
      }));

      const marketingSources = db.prepare('SELECT * FROM marketing_sources WHERE event_id = ? ORDER BY sort_order ASC').all(eventId).map(ms => ({
        ...ms,
        assignee_name: usersMap[ms.assignee_id]?.name || '未分配'
      }));

      const followUps = db.prepare('SELECT * FROM follow_ups WHERE event_id = ? ORDER BY updated_at DESC').all(eventId).map(f => ({
        ...f,
        steps_completed: JSON.parse(f.steps_completed_json || '[false,false,false,false,false,false,false]'),
        assignee_name: usersMap[f.assignee_id]?.name || '未分配',
        parent_phone: hasSensitiveAccess ? f.parent_phone : (f.parent_phone ? f.parent_phone.slice(0, 4) + '-****' : '***权限保护***'),
        whatsapp_notes: (hasSensitiveAccess || f.assignee_id === currentUser.id) ? f.whatsapp_notes : '（仅负责跟进老师、负责人及院长可查看家长沟通详情）'
      }));

      syncBudgetCosts(eventId);
      const budget = db.prepare('SELECT * FROM budgets WHERE event_id = ?').get(eventId);
      const expenses = db.prepare('SELECT * FROM expenses WHERE event_id = ? ORDER BY expense_date DESC').all(eventId);
      const attachments = db.prepare('SELECT * FROM attachments WHERE event_id = ? ORDER BY uploaded_at DESC').all(eventId);
      const review = db.prepare('SELECT * FROM event_reviews WHERE event_id = ?').get(eventId);
      const executionLogs = db.prepare('SELECT * FROM checklist_execution_logs WHERE event_id = ? ORDER BY created_at DESC LIMIT 80').all(eventId);
      const approvals = db.prepare('SELECT * FROM approvals WHERE event_id = ? ORDER BY created_at DESC LIMIT 80').all(eventId);

      // Past event references of same category
      const referenceReviews = db.prepare(`
        SELECT r.*, e.name as event_name, e.event_code, e.start_date
        FROM event_reviews r
        JOIN events e ON e.id = r.event_id
        WHERE e.category = ? AND e.id != ? AND r.save_as_reference = 1
        ORDER BY e.start_date DESC LIMIT 5
      `).all(event.category, eventId);

      const summary = computeEventSummaryAndRisks(event);

      return sendJson(res, 200, {
        event: {
          ...event,
          target_grades: JSON.parse(event.target_grades || '[]'),
          assistant_ids: JSON.parse(event.assistant_ids || '[]'),
          milestone_nodes: JSON.parse(event.milestone_nodes_json || '{}'),
          leader_name: usersMap[event.leader_id]?.name || '未指定'
        },
        permissions: {
          can_approve: canApprove(currentUser, event),
          can_view_finance: hasFinanceAccess,
          can_view_sensitive_contacts: hasSensitiveAccess,
          can_edit_event: currentUser.role_id === 'admin' || event.leader_id === currentUser.id
        },
        summary,
        checklistItems,
        tasks,
        materials,
        schedules,
        registrations,
        marketingSources,
        followUps,
        budget: hasFinanceAccess ? budget : null,
        expenses: hasFinanceAccess ? expenses : [],
        attachments,
        review,
        referenceReviews,
        executionLogs,
        approvals
      });
    }

    // Update Event Basic Info / Status / Readiness Override
    if (pathname.match(/^\/api\/events\/[^/]+$/) && method === 'PUT') {
      const eventId = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!existing) return sendJson(res, 404, { error: '找不到活动' });

      const body = await parseBody(req);
      const startDate = body.start_date || existing.start_date;
      const dateParts = startDate.split('-');
      const year = body.year ? Number(body.year) : Number(dateParts[0]);
      const month = body.month ? Number(body.month) : Number(dateParts[1]);
      const expectedStudents = body.expected_students !== undefined ? Number(body.expected_students) : existing.expected_students;

      db.prepare(`
        UPDATE events SET
          name = COALESCE(?, name),
          theme = COALESCE(?, theme),
          category = COALESCE(?, category),
          year = ?,
          month = ?,
          start_date = ?,
          end_date = COALESCE(?, end_date),
          start_time = COALESCE(?, start_time),
          end_time = COALESCE(?, end_time),
          location = COALESCE(?, location),
          branch = COALESCE(?, branch),
          target_grades = COALESCE(?, target_grades),
          age_range = COALESCE(?, age_range),
          leader_id = COALESCE(?, leader_id),
          assistant_ids = COALESCE(?, assistant_ids),
          expected_students = ?,
          min_students = COALESCE(?, min_students),
          actual_students = COALESCE(?, actual_students),
          fee_rm = COALESCE(?, fee_rm),
          budget_rm = COALESCE(?, budget_rm),
          purpose = COALESCE(?, purpose),
          goals = COALESCE(?, goals),
          description = COALESCE(?, description),
          precautions = COALESCE(?, precautions),
          poster_url = COALESCE(?, poster_url),
          internal_notes = COALESCE(?, internal_notes),
          status = COALESCE(?, status),
          followup_completed = COALESCE(?, followup_completed),
          readiness_override_reason = COALESCE(?, readiness_override_reason),
          readiness_override_by = COALESCE(?, readiness_override_by),
          readiness_override_at = COALESCE(?, readiness_override_at),
          level1_name = COALESCE(?, level1_name),
          level1_definition = COALESCE(?, level1_definition),
          level1_target = COALESCE(?, level1_target),
          level2_name = COALESCE(?, level2_name),
          level2_definition = COALESCE(?, level2_definition),
          level2_target = COALESCE(?, level2_target),
          success_metric_type = COALESCE(?, success_metric_type),
          milestone_nodes_json = COALESCE(?, milestone_nodes_json),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        body.name ?? null,
        body.theme ?? null,
        body.category ?? null,
        year,
        month,
        startDate,
        body.end_date ?? null,
        body.start_time ?? null,
        body.end_time ?? null,
        body.location ?? null,
        body.branch ?? null,
        body.target_grades ? JSON.stringify(body.target_grades) : null,
        body.age_range ?? null,
        body.leader_id ?? null,
        body.assistant_ids ? JSON.stringify(body.assistant_ids) : null,
        expectedStudents,
        body.min_students !== undefined ? Number(body.min_students) : null,
        body.actual_students !== undefined ? Number(body.actual_students) : null,
        body.fee_rm !== undefined ? Number(body.fee_rm) : null,
        body.budget_rm !== undefined ? Number(body.budget_rm) : null,
        body.purpose ?? null,
        body.goals ?? null,
        body.description ?? null,
        body.precautions ?? null,
        body.poster_url ?? null,
        body.internal_notes ?? null,
        body.status ?? null,
        body.followup_completed !== undefined ? (body.followup_completed ? 1 : 0) : null,
        body.readiness_override_reason ?? null,
        body.readiness_override_reason ? currentUser.name : null,
        body.readiness_override_reason ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null,
        body.level1_name ?? null,
        body.level1_definition ?? null,
        body.level1_target !== undefined ? Number(body.level1_target) : null,
        body.level2_name ?? null,
        body.level2_definition ?? null,
        body.level2_target !== undefined ? Number(body.level2_target) : null,
        body.success_metric_type ?? null,
        body.milestone_nodes ? JSON.stringify(body.milestone_nodes) : null,
        eventId
      );

      // If expected_students changed, auto-recalculate all material requirements for this event!
      if (body.expected_students !== undefined && Number(body.expected_students) !== existing.expected_students) {
        const mats = db.prepare('SELECT * FROM event_material_requirements WHERE event_id = ?').all(eventId);
        const updMat = db.prepare(`
          UPDATE event_material_requirements
          SET expected_students = ?, total_required_qty = ?, need_purchase_qty = ?, final_actual_cost = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        mats.forEach(m => {
          const calc = recalculateMaterialRequirement(m, expectedStudents);
          updMat.run(expectedStudents, calc.totalRequiredQty, calc.needPurchaseQty, calc.finalActualCost, m.id);
        });
        syncBudgetCosts(eventId);
      }

      logAudit(currentUser, eventId, '活动管理', '更新活动资料', `更新活动 ${existing.name} 状态/资料`);
      const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      return sendJson(res, 200, { event: updated });
    }

    if (pathname.match(/^\/api\/events\/[^/]+$/) && method === 'DELETE') {
      if (currentUser.role_id !== 'admin') {
        return sendJson(res, 403, { error: '权限不足：只有 Admin／院长 可以永久删除活动档案' });
      }
      const eventId = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!existing) return sendJson(res, 404, { error: '活动不存在' });

      db.prepare('DELETE FROM event_checklist_items WHERE event_id = ?').run(eventId);
      db.prepare('DELETE FROM tasks WHERE event_id = ?').run(eventId);
      db.prepare('DELETE FROM event_material_requirements WHERE event_id = ?').run(eventId);
      db.prepare('DELETE FROM event_schedules WHERE event_id = ?').run(eventId);
      db.prepare('DELETE FROM registrations WHERE event_id = ?').run(eventId);
      db.prepare('DELETE FROM marketing_sources WHERE event_id = ?').run(eventId);
      db.prepare('DELETE FROM follow_ups WHERE event_id = ?').run(eventId);
      db.prepare('DELETE FROM budgets WHERE event_id = ?').run(eventId);
      db.prepare('DELETE FROM expenses WHERE event_id = ?').run(eventId);
      db.prepare('DELETE FROM events WHERE id = ?').run(eventId);

      logAudit(currentUser, eventId, '活动档案', '删除活动', `删除了活动 ${existing.name} (${existing.event_code})`);
      return sendJson(res, 200, { deleted: true });
    }

    // 4. Checklist Items (Ticklist Page 1 Core + Task Bidirectional Sync + Two-Layer Approval)
    if (pathname === '/api/checklist-items' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.event_id || !body.title) {
        return sendJson(res, 400, { error: '请提供活动ID与检查项名称' });
      }
      const chkId = uid('chk');
      const stage = body.stage || 'A';
      const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM event_checklist_items WHERE event_id = ? AND stage = ?').get(body.event_id, stage)?.m || 0;
      const sortOrder = body.sort_order !== undefined ? Number(body.sort_order) : (maxSort + 1);
      const allowRepeat = body.allow_repeat ? 1 : 0;
      const repeatRecords = allowRepeat ? [
        { round: '第一次发布/执行', date: body.due_date || '', assignee: '', result: '', completed: false },
        { round: '第二次发布/执行', date: '', assignee: '', result: '', completed: false },
        { round: '第三次发布/执行', date: '', assignee: '', result: '', completed: false }
      ] : [];

      db.prepare(`
        INSERT INTO event_checklist_items (
          id, event_id, stage, sort_order, title, category_tag, assignee_id, due_date,
          status, is_checked, is_required, allow_repeat, repeat_records_json, notes, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '未开始', 0, ?, ?, ?, ?, '待提交')
      `).run(
        chkId, body.event_id, stage, sortOrder, body.title, body.category_tag || '自定义检查项',
        body.assignee_id || currentUser.id, body.due_date || '',
        body.is_required !== undefined ? (body.is_required ? 1 : 0) : 1,
        allowRepeat, JSON.stringify(repeatRecords), body.notes || ''
      );

      // Synchronize with Tasks table!
      const event = db.prepare('SELECT name FROM events WHERE id = ?').get(body.event_id);
      const taskId = uid('tsk');
      db.prepare(`
        INSERT INTO tasks (
          id, event_id, checklist_item_id, title, content, stage, assignee_id,
          start_date, due_date, priority, status, approval_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '未开始', '待提交', ?)
      `).run(
        taskId, body.event_id, chkId, body.title,
        `[${event?.name || ''}] 阶段${stage} SOP任务：${body.title}`,
        stage, body.assignee_id || currentUser.id,
        body.due_date ? addDays(body.due_date, -3) : '', body.due_date || '',
        body.is_required ? '高' : '中', body.notes || ''
      );

      logAudit(currentUser, body.event_id, 'Ticklist', '新增检查项', `阶段${stage} 新增：${body.title}`);
      const item = db.prepare('SELECT * FROM event_checklist_items WHERE id = ?').get(chkId);
      return sendJson(res, 201, { item });
    }

    if (pathname.match(/^\/api\/checklist-items\/[^/]+$/) && method === 'PUT') {
      const itemId = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM event_checklist_items WHERE id = ?').get(itemId);
      if (!existing) return sendJson(res, 404, { error: '找不到该Ticklist项目' });

      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(existing.event_id);
      const body = await parseBody(req);

      // Permission rule: ordinary teacher cannot modify an already approved item unless admin/leader
      if (existing.approval_status === '审核通过' && currentUser.role_id === 'teacher' && !body.force_allow) {
        return sendJson(res, 403, { error: '该项目已通过主管审核确认，普通老师不能直接修改，请联系主管或院长' });
      }

      const nowIso = new Date().toISOString();
      const nowDate = nowIso.slice(0, 10);
      const nowTime = nowIso.slice(11, 19);

      let isChecked = existing.is_checked;
      let status = body.status !== undefined ? body.status : existing.status;
      let completedDate = existing.completed_date;
      let completedTime = existing.completed_time;
      let completedBy = existing.completed_by;
      let approvalStatus = existing.approval_status;

      // Handle checkbox toggle or status change
      if (body.is_checked !== undefined) {
        isChecked = body.is_checked ? 1 : 0;
        if (isChecked === 1) {
          status = '已完成';
          completedDate = body.completed_date || nowDate;
          completedTime = body.completed_time || nowTime;
          completedBy = currentUser.id;
          if (approvalStatus === '待提交' || approvalStatus === '退回修改' || approvalStatus === '需要补充资料') {
            approvalStatus = '待审核';
          }
        } else {
          status = body.status && body.status !== '已完成' ? body.status : '进行中';
          completedDate = '';
          completedTime = '';
          completedBy = '';
          approvalStatus = '待提交';
        }
      } else if (body.status !== undefined) {
        if (body.status === '已完成') {
          isChecked = 1;
          completedDate = completedDate || nowDate;
          completedTime = completedTime || nowTime;
          completedBy = completedBy || currentUser.id;
          if (approvalStatus === '待提交' || approvalStatus === '退回修改') {
            approvalStatus = '待审核';
          }
        } else if (body.status === '未开始' || body.status === '进行中' || body.status === '不适用') {
          isChecked = 0;
          completedDate = '';
          completedTime = '';
          completedBy = '';
        }
      }

      const newTitle = body.title !== undefined ? body.title : existing.title;
      const newAssigneeId = body.assignee_id !== undefined ? body.assignee_id : existing.assignee_id;
      const newDueDate = body.due_date !== undefined ? body.due_date : existing.due_date;
      const newNotes = body.notes !== undefined ? body.notes : existing.notes;
      const newRepeatRecords = body.repeat_records !== undefined ? JSON.stringify(body.repeat_records) : existing.repeat_records_json;

      db.prepare(`
        UPDATE event_checklist_items SET
          title = ?,
          sort_order = COALESCE(?, sort_order),
          assignee_id = ?,
          due_date = ?,
          completed_date = ?,
          completed_time = ?,
          completed_by = ?,
          status = ?,
          is_checked = ?,
          is_required = COALESCE(?, is_required),
          allow_repeat = COALESCE(?, allow_repeat),
          repeat_records_json = ?,
          notes = ?,
          actual_situation = COALESCE(?, actual_situation),
          need_re_followup = COALESCE(?, need_re_followup),
          parent_feedback = COALESCE(?, parent_feedback),
          next_followup_date = COALESCE(?, next_followup_date),
          contact_status = COALESCE(?, contact_status),
          followup_result = COALESCE(?, followup_result),
          whatsapp_notes = COALESCE(?, whatsapp_notes),
          evidence_url = COALESCE(?, evidence_url),
          evidence_name = COALESCE(?, evidence_name),
          approval_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        newTitle,
        body.sort_order !== undefined ? Number(body.sort_order) : null,
        newAssigneeId,
        newDueDate,
        completedDate,
        completedTime,
        completedBy,
        status,
        isChecked,
        body.is_required !== undefined ? (body.is_required ? 1 : 0) : null,
        body.allow_repeat !== undefined ? (body.allow_repeat ? 1 : 0) : null,
        newRepeatRecords,
        newNotes,
        body.actual_situation ?? null,
        body.need_re_followup !== undefined ? (body.need_re_followup ? 1 : 0) : null,
        body.parent_feedback ?? null,
        body.next_followup_date ?? null,
        body.contact_status ?? null,
        body.followup_result ?? null,
        body.whatsapp_notes ?? null,
        body.evidence_url ?? null,
        body.evidence_name ?? null,
        approvalStatus,
        itemId
      );

      // Bidirectional Sync: Update linked Task in `tasks` table!
      db.prepare(`
        UPDATE tasks SET
          title = ?,
          assignee_id = ?,
          due_date = ?,
          status = ?,
          approval_status = ?,
          notes = ?,
          is_acknowledged = CASE WHEN ? != '未开始' THEN 1 ELSE is_acknowledged END,
          completed_at = ?,
          completed_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE checklist_item_id = ?
      `).run(
        newTitle, newAssigneeId, newDueDate, status, approvalStatus, newNotes,
        status, isChecked ? `${completedDate} ${completedTime}` : '', completedBy,
        itemId
      );

      // Record execution history log
      const actionDesc = body.is_checked !== undefined
        ? (isChecked ? '勾选完成检查项' : '取消勾选检查项')
        : (body.assignee_id !== undefined && body.assignee_id !== existing.assignee_id ? '指派负责老师' : '更新检查项状态/备注');

      db.prepare(`
        INSERT INTO checklist_execution_logs (id, checklist_item_id, event_id, user_id, user_name, action, previous_status, new_status, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('log'), itemId, existing.event_id, currentUser.id, currentUser.name,
        actionDesc, existing.status, status,
        `项目「${newTitle}」状态: ${existing.status} -> ${status}`
      );

      logAudit(currentUser, existing.event_id, 'Ticklist', actionDesc, `${newTitle} (${status})`);
      const updated = db.prepare('SELECT * FROM event_checklist_items WHERE id = ?').get(itemId);
      return sendJson(res, 200, { item: updated });
    }

    // Two-Layer Approval Endpoint (Section 5: 审核通过 / 退回修改 / 需要补充资料 / 重新分配负责人)
    if (pathname.match(/^\/api\/checklist-items\/[^/]+\/approve$/) && method === 'POST') {
      const itemId = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM event_checklist_items WHERE id = ?').get(itemId);
      if (!existing) return sendJson(res, 404, { error: '找不到该Ticklist项目' });

      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(existing.event_id);
      if (!canApprove(currentUser, event)) {
        return sendJson(res, 403, { error: '权限不足：只有 Admin／院长 或 该活动负责人 可以执行审核确认' });
      }

      const body = await parseBody(req);
      const decision = body.decision; // '审核通过' | '退回修改' | '需要补充资料' | '重新分配负责人'
      const reason = body.reason || '';
      const reassignedTo = body.reassigned_to || existing.assignee_id;
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

      let newStatus = existing.status;
      let newIsChecked = existing.is_checked;
      let newApprovalStatus = decision;

      if (decision === '审核通过') {
        newStatus = '已完成';
        newIsChecked = 1;
      } else if (decision === '退回修改' || decision === '需要补充资料') {
        newStatus = '进行中';
        newIsChecked = 0;
      } else if (decision === '重新分配负责人') {
        newApprovalStatus = '待提交';
      }

      db.prepare(`
        UPDATE event_checklist_items SET
          status = ?,
          is_checked = ?,
          assignee_id = ?,
          approval_status = ?,
          reviewer_id = ?,
          reviewed_at = ?,
          rejection_reason = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newStatus, newIsChecked, reassignedTo, newApprovalStatus, currentUser.id, nowStr, reason, itemId);

      // Sync to linked Task!
      const linkedTask = db.prepare('SELECT id FROM tasks WHERE checklist_item_id = ?').get(itemId);
      if (linkedTask) {
        db.prepare(`
          UPDATE tasks SET
            status = ?,
            assignee_id = ?,
            approval_status = ?,
            rejection_reason = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newStatus, reassignedTo, newApprovalStatus, reason, linkedTask.id);
      }

      // Save to Approvals history table
      db.prepare(`
        INSERT INTO approvals (id, event_id, checklist_item_id, task_id, submitted_by, reviewer_id, reviewer_name, decision, reason, reassigned_to)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('apv'), existing.event_id, itemId, linkedTask ? linkedTask.id : '',
        existing.completed_by || existing.assignee_id, currentUser.id, currentUser.name,
        decision, reason, reassignedTo
      );

      db.prepare(`
        INSERT INTO checklist_execution_logs (id, checklist_item_id, event_id, user_id, user_name, action, previous_status, new_status, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('log'), itemId, existing.event_id, currentUser.id, currentUser.name,
        `主管审核：${decision}`, existing.approval_status, newApprovalStatus,
        reason ? `原因/备注：${reason}` : `审核决定：${decision}`
      );

      logAudit(currentUser, existing.event_id, '主管审核', decision, `审核项目「${existing.title}」: ${decision} ${reason}`);
      const updated = db.prepare('SELECT * FROM event_checklist_items WHERE id = ?').get(itemId);
      return sendJson(res, 200, { item: updated });
    }

    if (pathname.match(/^\/api\/checklist-items\/[^/]+$/) && method === 'DELETE') {
      const itemId = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM event_checklist_items WHERE id = ?').get(itemId);
      if (!existing) return sendJson(res, 404, { error: '项目不存在' });
      if (currentUser.role_id === 'teacher') {
        return sendJson(res, 403, { error: '普通老师不能删除SOP检查项' });
      }
      db.prepare('DELETE FROM tasks WHERE checklist_item_id = ?').run(itemId);
      db.prepare('DELETE FROM event_checklist_items WHERE id = ?').run(itemId);
      logAudit(currentUser, existing.event_id, 'Ticklist', '删除检查项', `删除了检查项：${existing.title}`);
      return sendJson(res, 200, { deleted: true });
    }

    // 5. Tasks Management (Section 6 - Synchronized with Ticklist)
    if (pathname === '/api/tasks' && method === 'GET') {
      let sql = `
        SELECT t.*, e.name as event_name, e.event_code, e.start_date as event_date
        FROM tasks t
        JOIN events e ON e.id = t.event_id
        WHERE 1=1
      `;
      const params = [];
      if (query.event_id) { sql += ' AND t.event_id = ?'; params.push(query.event_id); }
      if (query.assignee_id) { sql += ' AND t.assignee_id = ?'; params.push(query.assignee_id); }
      if (query.status) { sql += ' AND t.status = ?'; params.push(query.status); }
      if (query.stage) { sql += ' AND t.stage = ?'; params.push(query.stage); }
      sql += ' ORDER BY t.due_date ASC, t.created_at DESC';

      const usersMap = {};
      db.prepare('SELECT id, name, avatar_color FROM users').all().forEach(u => { usersMap[u.id] = u; });

      const tasks = db.prepare(sql).all(...params).map(t => ({
        ...t,
        assistant_ids: JSON.parse(t.assistant_ids || '[]'),
        assignee_name: usersMap[t.assignee_id]?.name || '未分配',
        assignee_color: usersMap[t.assignee_id]?.avatar_color || '#C8102E'
      }));
      return sendJson(res, 200, { tasks });
    }

    if (pathname === '/api/tasks' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.event_id || !body.title) {
        return sendJson(res, 400, { error: '请选择所属活动并填写任务标题' });
      }
      const taskId = uid('tsk');
      let chkId = body.checklist_item_id || '';

      // If user chooses to sync this new task to Ticklist (default true so Ticklist & Task are unified!)
      if (body.sync_to_ticklist !== false && !chkId) {
        chkId = uid('chk');
        const stage = body.stage || 'A';
        const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM event_checklist_items WHERE event_id = ? AND stage = ?').get(body.event_id, stage)?.m || 0;
        db.prepare(`
          INSERT INTO event_checklist_items (
            id, event_id, stage, sort_order, title, category_tag, assignee_id, due_date,
            status, is_checked, is_required, notes, approval_status
          ) VALUES (?, ?, ?, ?, ?, '新增任务同步', ?, ?, ?, ?, ?, ?, '待提交')
        `).run(
          chkId, body.event_id, stage, maxSort + 1, body.title,
          body.assignee_id || currentUser.id, body.due_date || '',
          body.status || '未开始', body.status === '已完成' ? 1 : 0,
          body.priority === '高' ? 1 : 0, body.notes || ''
        );
      }

      db.prepare(`
        INSERT INTO tasks (
          id, event_id, checklist_item_id, title, content, stage, assignee_id, assistant_ids,
          start_date, due_date, priority, status, approval_status, attachment_url, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待提交', ?, ?)
      `).run(
        taskId, body.event_id, chkId, body.title, body.content || '', body.stage || 'A',
        body.assignee_id || currentUser.id, JSON.stringify(body.assistant_ids || []),
        body.start_date || '', body.due_date || '', body.priority || '中',
        body.status || '未开始', body.attachment_url || '', body.notes || ''
      );

      logAudit(currentUser, body.event_id, '老师任务安排', '新增任务', `新增任务：${body.title}`);
      const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      return sendJson(res, 201, { task: created });
    }

    if (pathname.match(/^\/api\/tasks\/[^/]+$/) && method === 'PUT') {
      const taskId = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      if (!existing) return sendJson(res, 404, { error: '任务不存在' });

      const body = await parseBody(req);
      const nowIso = new Date().toISOString();
      const nowDate = nowIso.slice(0, 10);
      const nowTime = nowIso.slice(11, 19);

      const newTitle = body.title !== undefined ? body.title : existing.title;
      const newAssigneeId = body.assignee_id !== undefined ? body.assignee_id : existing.assignee_id;
      const newDueDate = body.due_date !== undefined ? body.due_date : existing.due_date;
      const newStatus = body.status !== undefined ? body.status : existing.status;
      const newNotes = body.notes !== undefined ? body.notes : existing.notes;
      const isCompleted = newStatus === '已完成';
      const newApprovalStatus = body.approval_status !== undefined
        ? body.approval_status
        : (isCompleted && existing.approval_status === '待提交' ? '待审核' : existing.approval_status);

      db.prepare(`
        UPDATE tasks SET
          title = ?,
          content = COALESCE(?, content),
          stage = COALESCE(?, stage),
          assignee_id = ?,
          assistant_ids = COALESCE(?, assistant_ids),
          start_date = COALESCE(?, start_date),
          due_date = ?,
          priority = COALESCE(?, priority),
          status = ?,
          approval_status = ?,
          attachment_url = COALESCE(?, attachment_url),
          notes = ?,
          is_acknowledged = COALESCE(?, is_acknowledged),
          completed_at = ?,
          completed_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        newTitle,
        body.content ?? null,
        body.stage ?? null,
        newAssigneeId,
        body.assistant_ids ? JSON.stringify(body.assistant_ids) : null,
        body.start_date ?? null,
        newDueDate,
        body.priority ?? null,
        newStatus,
        newApprovalStatus,
        body.attachment_url ?? null,
        newNotes,
        body.is_acknowledged !== undefined ? (body.is_acknowledged ? 1 : 0) : (newStatus !== '未开始' ? 1 : existing.is_acknowledged),
        isCompleted ? (existing.completed_at || `${nowDate} ${nowTime}`) : '',
        isCompleted ? (existing.completed_by || currentUser.id) : '',
        taskId
      );

      // Bidirectional Sync: Update linked Ticklist item!
      if (existing.checklist_item_id) {
        db.prepare(`
          UPDATE event_checklist_items SET
            title = ?,
            assignee_id = ?,
            due_date = ?,
            status = ?,
            is_checked = ?,
            completed_date = ?,
            completed_time = ?,
            completed_by = ?,
            approval_status = ?,
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          newTitle, newAssigneeId, newDueDate, newStatus,
          isCompleted ? 1 : 0,
          isCompleted ? nowDate : '',
          isCompleted ? nowTime : '',
          isCompleted ? currentUser.id : '',
          newApprovalStatus,
          newNotes,
          existing.checklist_item_id
        );

        db.prepare(`
          INSERT INTO checklist_execution_logs (id, checklist_item_id, event_id, user_id, user_name, action, previous_status, new_status, details)
          VALUES (?, ?, ?, ?, ?, '从任务中心同步状态', ?, ?, ?)
        `).run(
          uid('log'), existing.checklist_item_id, existing.event_id, currentUser.id, currentUser.name,
          existing.status, newStatus, `任务「${newTitle}」在任务管理中更新为 ${newStatus}`
        );
      }

      logAudit(currentUser, existing.event_id, '老师任务安排', '更新任务', `${newTitle} -> ${newStatus}`);
      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      return sendJson(res, 200, { task: updated });
    }

    // 6. Materials & Shared Inventory (Section 7)
    if (pathname === '/api/inventory' && method === 'GET') {
      const materials = db.prepare('SELECT * FROM materials ORDER BY category ASC, name ASC').all();
      const transactions = db.prepare('SELECT * FROM inventory_transactions ORDER BY created_at DESC LIMIT 60').all();
      return sendJson(res, 200, { materials, transactions });
    }

    if (pathname === '/api/inventory' && method === 'POST') {
      const body = await parseBody(req);
      const id = uid('mat');
      db.prepare(`
        INSERT INTO materials (id, name, category, unit, total_stock, reserved_stock, default_unit_price, supplier_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, body.name, body.category || '手工美术', body.unit || '个',
        Number(body.total_stock) || 0, Number(body.reserved_stock) || 0,
        Number(body.default_unit_price) || 0, body.supplier_id || '', body.notes || ''
      );
      logAudit(currentUser, '', '中心总库存', '新增库存品项', `新增材料：${body.name}`);
      return sendJson(res, 201, { material: db.prepare('SELECT * FROM materials WHERE id = ?').get(id) });
    }

    if (pathname === '/api/inventory/transaction' && method === 'POST') {
      const body = await parseBody(req);
      const mat = db.prepare('SELECT * FROM materials WHERE id = ?').get(body.material_id);
      if (!mat) return sendJson(res, 404, { error: '找不到库存材料' });

      const qty = Number(body.quantity) || 0;
      const txType = body.tx_type || '入库'; // '入库' | '预留' | '领用' | '归还' | '损耗' | '库存调整'
      const beforeStock = mat.total_stock;
      let afterStock = mat.total_stock;
      let reservedStock = mat.reserved_stock;

      const availableStock = mat.total_stock - mat.reserved_stock;
      if ((txType === '预留' || txType === '领用') && qty > availableStock) {
        return sendJson(res, 400, { error: `可用库存不足！当前总库存 ${mat.total_stock}，已被其他活动预留 ${mat.reserved_stock}，仅剩可用 ${availableStock} ${mat.unit}` });
      }

      if (txType === '入库' || txType === '归还') {
        afterStock = beforeStock + qty;
      } else if (txType === '领用' || txType === '损耗') {
        afterStock = Math.max(0, beforeStock - qty);
      } else if (txType === '预留') {
        reservedStock = reservedStock + qty;
      } else if (txType === '库存调整') {
        afterStock = qty;
      }

      db.prepare('UPDATE materials SET total_stock = ?, reserved_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(afterStock, reservedStock, mat.id);

      db.prepare(`
        INSERT INTO inventory_transactions (id, material_id, event_id, tx_type, quantity, before_stock, after_stock, operator_id, operator_name, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('itx'), mat.id, body.event_id || '', txType, qty, beforeStock, afterStock, currentUser.id, currentUser.name, body.notes || ''
      );

      logAudit(currentUser, body.event_id || '', '中心总库存', `库存${txType}`, `${mat.name}: ${txType} ${qty} ${mat.unit}`);
      return sendJson(res, 200, { material: db.prepare('SELECT * FROM materials WHERE id = ?').get(mat.id) });
    }

    if (pathname === '/api/event-materials' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.event_id || !body.name) {
        return sendJson(res, 400, { error: '请填写材料名称与所属活动' });
      }
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(body.event_id);
      const expStudents = body.expected_students !== undefined ? Number(body.expected_students) : (event?.expected_students || 50);

      // Check shared inventory if material_id provided
      let availStock = Number(body.current_stock_available) || 0;
      if (body.material_id) {
        const sharedMat = db.prepare('SELECT * FROM materials WHERE id = ?').get(body.material_id);
        if (sharedMat && body.current_stock_available === undefined) {
          availStock = Math.max(0, sharedMat.total_stock - sharedMat.reserved_stock);
        }
      }

      const calc = recalculateMaterialRequirement({ ...body, current_stock_available: availStock }, expStudents);
      const reqId = uid('req');

      db.prepare(`
        INSERT INTO event_material_requirements (
          id, event_id, material_id, name, purpose, buyer_id, category, unit,
          qty_per_student, fixed_extra_qty, expected_students, safety_buffer_qty,
          total_required_qty, current_stock_available, need_purchase_qty, reserved_from_stock,
          pricing_plan, unit_price, original_price, air_freight_price, sea_freight_price, shipping_fee, final_actual_cost,
          supplier_name, purchase_link, expected_arrival_date, procurement_status, is_critical, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reqId, body.event_id, body.material_id || '', body.name, body.purpose || '',
        body.buyer_id || currentUser.id, body.category || '手工美术', body.unit || '个',
        Number(body.qty_per_student) || 0, Number(body.fixed_extra_qty) || 0,
        expStudents, Number(body.safety_buffer_qty) || 0,
        calc.totalRequiredQty, availStock, calc.needPurchaseQty, Number(body.reserved_from_stock) || 0,
        body.pricing_plan || 'actual', calc.unitPrice, Number(body.original_price) || calc.unitPrice,
        Number(body.air_freight_price) || 0, Number(body.sea_freight_price) || 0,
        Number(body.shipping_fee) || 0, calc.finalActualCost,
        body.supplier_name || '', body.purchase_link || '', body.expected_arrival_date || '',
        body.procurement_status || '待确认', body.is_critical !== undefined ? (body.is_critical ? 1 : 0) : 1,
        body.notes || ''
      );

      syncBudgetCosts(body.event_id);
      logAudit(currentUser, body.event_id, '活动材料管理', '新增材料需求', `${body.name} (总需求 ${calc.totalRequiredQty}, 需采购 ${calc.needPurchaseQty})`);
      const created = db.prepare('SELECT * FROM event_material_requirements WHERE id = ?').get(reqId);
      return sendJson(res, 201, { materialRequirement: created });
    }

    if (pathname.match(/^\/api\/event-materials\/[^/]+$/) && method === 'PUT') {
      const reqId = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM event_material_requirements WHERE id = ?').get(reqId);
      if (!existing) return sendJson(res, 404, { error: '找不到该材料记录' });

      const body = await parseBody(req);
      const merged = { ...existing, ...body };
      const calc = recalculateMaterialRequirement(merged, merged.expected_students);

      // Determine procurement status label from 9-step checkboxes if updated
      const s1 = body.step_confirmed !== undefined ? (body.step_confirmed ? 1 : 0) : existing.step_confirmed;
      const s2 = body.step_stock_checked !== undefined ? (body.step_stock_checked ? 1 : 0) : existing.step_stock_checked;
      const s3 = body.step_decided_buy !== undefined ? (body.step_decided_buy ? 1 : 0) : existing.step_decided_buy;
      const s4 = body.step_ordered !== undefined ? (body.step_ordered ? 1 : 0) : existing.step_ordered;
      const s5 = body.step_paid !== undefined ? (body.step_paid ? 1 : 0) : existing.step_paid;
      const s6 = body.step_arrived !== undefined ? (body.step_arrived ? 1 : 0) : existing.step_arrived;
      const s7 = body.step_counted !== undefined ? (body.step_counted ? 1 : 0) : existing.step_counted;
      const s8 = body.step_allocated !== undefined ? (body.step_allocated ? 1 : 0) : existing.step_allocated;
      const s9 = body.step_ready !== undefined ? (body.step_ready ? 1 : 0) : existing.step_ready;

      let procStatus = body.procurement_status || existing.procurement_status;
      if (s9) procStatus = '已准备完成';
      else if (s8) procStatus = '已分配到活动';
      else if (s7) procStatus = '已点算数量';
      else if (s6) procStatus = '已到货';
      else if (s5) procStatus = '已付款';
      else if (s4) procStatus = '已下单';
      else if (s3) procStatus = '已决定购买';
      else if (s2) procStatus = '已检查库存';
      else if (s1) procStatus = '已确认需要';

      db.prepare(`
        UPDATE event_material_requirements SET
          name = ?,
          purpose = ?,
          buyer_id = ?,
          category = ?,
          unit = ?,
          qty_per_student = ?,
          fixed_extra_qty = ?,
          expected_students = ?,
          safety_buffer_qty = ?,
          total_required_qty = ?,
          current_stock_available = ?,
          need_purchase_qty = ?,
          pricing_plan = ?,
          unit_price = ?,
          original_price = ?,
          air_freight_price = ?,
          sea_freight_price = ?,
          shipping_fee = ?,
          final_actual_cost = ?,
          supplier_name = ?,
          purchase_link = ?,
          expected_arrival_date = ?,
          actual_arrival_date = ?,
          actual_arrived_qty = ?,
          procurement_status = ?,
          step_confirmed = ?,
          step_stock_checked = ?,
          step_decided_buy = ?,
          step_ordered = ?,
          step_paid = ?,
          step_arrived = ?,
          step_counted = ?,
          step_allocated = ?,
          step_ready = ?,
          photo_url = ?,
          receipt_url = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        merged.name, merged.purpose, merged.buyer_id, merged.category, merged.unit,
        Number(merged.qty_per_student) || 0, Number(merged.fixed_extra_qty) || 0,
        calc.expectedStudents, Number(merged.safety_buffer_qty) || 0,
        calc.totalRequiredQty, Number(merged.current_stock_available) || 0, calc.needPurchaseQty,
        merged.pricing_plan || 'actual', calc.unitPrice,
        Number(merged.original_price) || 0, Number(merged.air_freight_price) || 0, Number(merged.sea_freight_price) || 0,
        Number(merged.shipping_fee) || 0, calc.finalActualCost,
        merged.supplier_name || '', merged.purchase_link || '',
        merged.expected_arrival_date || '', merged.actual_arrival_date || '',
        Number(merged.actual_arrived_qty) || 0, procStatus,
        s1, s2, s3, s4, s5, s6, s7, s8, s9,
        merged.photo_url || '', merged.receipt_url || '', merged.notes || '',
        reqId
      );

      syncBudgetCosts(existing.event_id);
      logAudit(currentUser, existing.event_id, '活动材料管理', '更新材料/采购进度', `${merged.name}: ${procStatus}`);
      const updated = db.prepare('SELECT * FROM event_material_requirements WHERE id = ?').get(reqId);
      return sendJson(res, 200, { materialRequirement: updated });
    }

    if (pathname.match(/^\/api\/event-materials\/[^/]+$/) && method === 'DELETE') {
      const reqId = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM event_material_requirements WHERE id = ?').get(reqId);
      if (!existing) return sendJson(res, 404, { error: '记录不存在' });
      db.prepare('DELETE FROM event_material_requirements WHERE id = ?').run(reqId);
      syncBudgetCosts(existing.event_id);
      return sendJson(res, 200, { deleted: true });
    }

    // 7. Run of Show Schedules (Section 8)
    if (pathname === '/api/schedules' && method === 'POST') {
      const body = await parseBody(req);
      const id = uid('ros');
      const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM event_schedules WHERE event_id = ?').get(body.event_id)?.m || 0;
      db.prepare(`
        INSERT INTO event_schedules (
          id, event_id, sort_order, start_time, end_time, title, assignee_id,
          materials_needed, venue, instructions, precautions, status, is_completed, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '未开始', 0, ?)
      `).run(
        id, body.event_id, body.sort_order || (maxSort + 1), body.start_time || '13:00', body.end_time || '13:30',
        body.title, body.assignee_id || currentUser.id, body.materials_needed || '',
        body.venue || '主礼堂', body.instructions || '', body.precautions || '', body.notes || ''
      );
      return sendJson(res, 201, { schedule: db.prepare('SELECT * FROM event_schedules WHERE id = ?').get(id) });
    }

    if (pathname.match(/^\/api\/schedules\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM event_schedules WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: '流程环节不存在' });

      const body = await parseBody(req);
      const isCompleted = body.is_completed !== undefined ? (body.is_completed ? 1 : 0) : (body.status === '已完成' ? 1 : existing.is_completed);
      const status = body.status !== undefined ? body.status : (isCompleted ? '已完成' : '未开始');

      db.prepare(`
        UPDATE event_schedules SET
          sort_order = COALESCE(?, sort_order),
          start_time = COALESCE(?, start_time),
          end_time = COALESCE(?, end_time),
          title = COALESCE(?, title),
          assignee_id = COALESCE(?, assignee_id),
          materials_needed = COALESCE(?, materials_needed),
          venue = COALESCE(?, venue),
          instructions = COALESCE(?, instructions),
          precautions = COALESCE(?, precautions),
          status = ?,
          is_completed = ?,
          completed_at = ?,
          notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(
        body.sort_order !== undefined ? Number(body.sort_order) : null,
        body.start_time ?? null,
        body.end_time ?? null,
        body.title ?? null,
        body.assignee_id ?? null,
        body.materials_needed ?? null,
        body.venue ?? null,
        body.instructions ?? null,
        body.precautions ?? null,
        status,
        isCompleted,
        isCompleted ? new Date().toISOString().slice(11, 19) : '',
        body.notes ?? null,
        id
      );

      // Keep chronological order if times were modified
      const allScheds = db.prepare('SELECT id FROM event_schedules WHERE event_id = ? ORDER BY start_time ASC, sort_order ASC').all(existing.event_id);
      const updSort = db.prepare('UPDATE event_schedules SET sort_order = ? WHERE id = ?');
      allScheds.forEach((s, idx) => updSort.run(idx + 1, s.id));

      return sendJson(res, 200, { schedule: db.prepare('SELECT * FROM event_schedules WHERE id = ?').get(id) });
    }

    if (pathname === '/api/schedules/reorder' && method === 'POST') {
      const body = await parseBody(req);
      if (Array.isArray(body.ordered_ids)) {
        const upd = db.prepare('UPDATE event_schedules SET sort_order = ? WHERE id = ?');
        body.ordered_ids.forEach((id, idx) => upd.run(idx + 1, id));
      }
      return sendJson(res, 200, { ok: true });
    }

    if (pathname.match(/^\/api\/schedules\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      db.prepare('DELETE FROM event_schedules WHERE id = ?').run(id);
      return sendJson(res, 200, { deleted: true });
    }

    // 8. Registrations & Student Records (Section 9)
    if (pathname === '/api/registrations' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.event_id || !body.student_name) {
        return sendJson(res, 400, { error: '请填写学生名字与所属活动' });
      }
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(body.event_id);
      const activeCount = db.prepare("SELECT COUNT(*) as c FROM registrations WHERE event_id = ? AND status = '已报名'").get(body.event_id).c;

      // Support capacity limit & automatic waitlist
      let regStatus = body.status || '已报名';
      if (event && event.expected_students > 0 && activeCount >= event.expected_students && !body.force_enroll) {
        regStatus = '候补名单';
      }

      const payable = body.payable_rm !== undefined ? Number(body.payable_rm) : (event?.fee_rm || 0);
      const paid = body.paid_rm !== undefined ? Number(body.paid_rm) : 0;
      const balance = Math.max(0, payable - paid);
      const id = uid('reg');
      const receiptNo = body.receipt_no || (paid > 0 ? `RCP-${Date.now().toString().slice(-6)}` : '');

      db.prepare(`
        INSERT INTO registrations (
          id, event_id, student_name, grade, branch, student_type, parent_name, parent_phone,
          registration_date, source, status, payment_method, payable_rm, paid_rm, balance_rm,
          receipt_no, attended, converted_to_course, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, body.event_id, body.student_name, body.grade || '三年级',
        body.branch || event?.branch || '总院 Main Branch',
        body.student_type || '本院生', body.parent_name || '', body.parent_phone || '',
        body.registration_date || new Date().toISOString().slice(0, 10),
        body.source || '本院家长Group', regStatus, body.payment_method || 'TNG',
        payable, paid, balance, receiptNo,
        body.attended ? 1 : 0, body.converted_to_course ? 1 : 0, body.notes || ''
      );

      if (paid > 0) {
        db.prepare(`
          INSERT INTO payments (id, registration_id, event_id, student_name, amount_rm, payment_method, receipt_no, received_by, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uid('pay'), id, body.event_id, body.student_name, paid, body.payment_method || 'TNG', receiptNo, currentUser.name, '报名缴费');
      }

      // If non-center student, automatically create Stage C 7-step follow-up card!
      if (body.student_type === '非本院生') {
        db.prepare(`
          INSERT INTO follow_ups (
            id, event_id, registration_id, student_name, student_type, parent_phone,
            assignee_id, step_number, days_after_event, due_date, contact_status, followup_result
          ) VALUES (?, ?, ?, ?, '非本院生', ?, ?, 1, 1, ?, '未联络', '跟进中')
        `).run(
          uid('flw'), body.event_id, id, body.student_name, body.parent_phone || '',
          event?.leader_id || currentUser.id, event ? addDays(event.start_date, 1) : ''
        );
      }

      syncBudgetCosts(body.event_id);
      logAudit(currentUser, body.event_id, '报名管理', '新增学生报名', `${body.student_name} (${body.student_type}) 已付 RM${paid}`);
      return sendJson(res, 201, { registration: db.prepare('SELECT * FROM registrations WHERE id = ?').get(id) });
    }

    if (pathname === '/api/registrations/import-csv' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.event_id || !Array.isArray(body.rows)) {
        return sendJson(res, 400, { error: '请提供有效的导入数据' });
      }
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(body.event_id);
      let importedCount = 0;
      for (const r of body.rows) {
        if (!r.student_name) continue;
        const payable = r.payable_rm !== undefined ? Number(r.payable_rm) : (event?.fee_rm || 0);
        const paid = Number(r.paid_rm) || 0;
        const balance = Math.max(0, payable - paid);
        const regId = uid('reg');
        db.prepare(`
          INSERT INTO registrations (
            id, event_id, student_name, grade, branch, student_type, parent_name, parent_phone,
            registration_date, source, status, payment_method, payable_rm, paid_rm, balance_rm, receipt_no, attended, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '已报名', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          regId, body.event_id, r.student_name, r.grade || '三年级', r.branch || event?.branch || '总院 Main Branch',
          r.student_type || '本院生', r.parent_name || '', r.parent_phone || '',
          new Date().toISOString().slice(0, 10), r.source || 'CSV批量导入',
          r.payment_method || 'TNG', payable, paid, balance,
          paid > 0 ? `RCP-IMP-${100 + importedCount}` : '', r.attended ? 1 : 0, r.notes || ''
        );
        importedCount++;
      }
      syncBudgetCosts(body.event_id);
      logAudit(currentUser, body.event_id, '报名管理', '批量导入报名名单', `成功导入 ${importedCount} 名学生`);
      return sendJson(res, 201, { importedCount });
    }

    if (pathname.match(/^\/api\/registrations\/[^/]+$/) && method === 'PUT') {
      const regId = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM registrations WHERE id = ?').get(regId);
      if (!existing) return sendJson(res, 404, { error: '报名记录不存在' });

      const body = await parseBody(req);
      const payable = body.payable_rm !== undefined ? Number(body.payable_rm) : existing.payable_rm;
      const paid = body.paid_rm !== undefined ? Number(body.paid_rm) : existing.paid_rm;
      const balance = Math.max(0, payable - paid);

      db.prepare(`
        UPDATE registrations SET
          student_name = COALESCE(?, student_name),
          grade = COALESCE(?, grade),
          branch = COALESCE(?, branch),
          student_type = COALESCE(?, student_type),
          parent_name = COALESCE(?, parent_name),
          parent_phone = COALESCE(?, parent_phone),
          source = COALESCE(?, source),
          status = COALESCE(?, status),
          payment_method = COALESCE(?, payment_method),
          payable_rm = ?,
          paid_rm = ?,
          balance_rm = ?,
          receipt_no = COALESCE(?, receipt_no),
          attended = COALESCE(?, attended),
          converted_to_course = COALESCE(?, converted_to_course),
          notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(
        body.student_name ?? null,
        body.grade ?? null,
        body.branch ?? null,
        body.student_type ?? null,
        body.parent_name ?? null,
        body.parent_phone ?? null,
        body.source ?? null,
        body.status ?? null,
        body.payment_method ?? null,
        payable, paid, balance,
        body.receipt_no ?? null,
        body.attended !== undefined ? (body.attended ? 1 : 0) : null,
        body.converted_to_course !== undefined ? (body.converted_to_course ? 1 : 0) : null,
        body.notes ?? null,
        regId
      );

      syncBudgetCosts(existing.event_id);
      return sendJson(res, 200, { registration: db.prepare('SELECT * FROM registrations WHERE id = ?').get(regId) });
    }

    // 9. Non-Center Marketing Sources & Follow-Ups (Section 10 & Stage C)
    if (pathname === '/api/marketing-sources' && method === 'POST') {
      const body = await parseBody(req);
      const id = uid('src');
      const reg = Number(body.registered_count) || 0;
      const suc = Number(body.success_count) || 0;
      const rate = reg > 0 ? Number(((suc / reg) * 100).toFixed(1)) : 0;
      db.prepare(`
        INSERT INTO marketing_sources (
          id, event_id, source_name, sort_order, database_count, contacted_count,
          responded_count, registered_count, attended_count, success_count, conversion_rate, assignee_id, notes
        ) VALUES (?, ?, ?, 99, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, body.event_id, body.source_name,
        Number(body.database_count) || 0, Number(body.contacted_count) || 0,
        Number(body.responded_count) || 0, reg, Number(body.attended_count) || 0,
        suc, rate, body.assignee_id || currentUser.id, body.notes || ''
      );
      return sendJson(res, 201, { source: db.prepare('SELECT * FROM marketing_sources WHERE id = ?').get(id) });
    }

    if (pathname.match(/^\/api\/marketing-sources\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM marketing_sources WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: '渠道记录不存在' });

      const body = await parseBody(req);
      const reg = body.registered_count !== undefined ? Number(body.registered_count) : existing.registered_count;
      const suc = body.success_count !== undefined ? Number(body.success_count) : existing.success_count;
      const rate = reg > 0 ? Number(((suc / reg) * 100).toFixed(1)) : 0;

      db.prepare(`
        UPDATE marketing_sources SET
          source_name = COALESCE(?, source_name),
          database_count = COALESCE(?, database_count),
          contacted_count = COALESCE(?, contacted_count),
          responded_count = COALESCE(?, responded_count),
          registered_count = ?,
          attended_count = COALESCE(?, attended_count),
          success_count = ?,
          conversion_rate = ?,
          assignee_id = COALESCE(?, assignee_id),
          notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(
        body.source_name ?? null,
        body.database_count !== undefined ? Number(body.database_count) : null,
        body.contacted_count !== undefined ? Number(body.contacted_count) : null,
        body.responded_count !== undefined ? Number(body.responded_count) : null,
        reg,
        body.attended_count !== undefined ? Number(body.attended_count) : null,
        suc, rate,
        body.assignee_id ?? null,
        body.notes ?? null,
        id
      );
      return sendJson(res, 200, { source: db.prepare('SELECT * FROM marketing_sources WHERE id = ?').get(id) });
    }

    if (pathname === '/api/follow-ups' && method === 'POST') {
      const body = await parseBody(req);
      const id = uid('flw');
      db.prepare(`
        INSERT INTO follow_ups (
          id, event_id, registration_id, student_name, student_type, parent_phone,
          assignee_id, step_number, days_after_event, due_date, contact_status,
          parent_feedback, next_followup_date, followup_result, whatsapp_notes, steps_completed_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, body.event_id, body.registration_id || '', body.student_name, body.student_type || '非本院生',
        body.parent_phone || '', body.assignee_id || currentUser.id,
        Number(body.step_number) || 1, Number(body.days_after_event) || 1,
        body.due_date || '', body.contact_status || '已联络',
        body.parent_feedback || '', body.next_followup_date || '',
        body.followup_result || '跟进中', body.whatsapp_notes || '',
        JSON.stringify(body.steps_completed || [false, false, false, false, false, false, false])
      );
      return sendJson(res, 201, { followUp: db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(id) });
    }

    if (pathname.match(/^\/api\/follow-ups\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: '跟进记录不存在' });

      const body = await parseBody(req);
      const stepsArr = body.steps_completed || JSON.parse(existing.steps_completed_json || '[false,false,false,false,false,false,false]');
      const allDone = stepsArr.every(Boolean) ? 1 : 0;

      db.prepare(`
        UPDATE follow_ups SET
          assignee_id = COALESCE(?, assignee_id),
          step_number = COALESCE(?, step_number),
          days_after_event = COALESCE(?, days_after_event),
          due_date = COALESCE(?, due_date),
          contact_status = COALESCE(?, contact_status),
          parent_feedback = COALESCE(?, parent_feedback),
          next_followup_date = COALESCE(?, next_followup_date),
          followup_result = COALESCE(?, followup_result),
          whatsapp_notes = COALESCE(?, whatsapp_notes),
          steps_completed_json = ?,
          is_completed = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        body.assignee_id ?? null,
        body.step_number !== undefined ? Number(body.step_number) : null,
        body.days_after_event !== undefined ? Number(body.days_after_event) : null,
        body.due_date ?? null,
        body.contact_status ?? null,
        body.parent_feedback ?? null,
        body.next_followup_date ?? null,
        body.followup_result ?? null,
        body.whatsapp_notes ?? null,
        JSON.stringify(stepsArr),
        allDone,
        id
      );

      // If followup_result is '已成功报读' and linked to registration, sync converted_to_course = 1
      if (body.followup_result === '已成功报读' && existing.registration_id) {
        db.prepare('UPDATE registrations SET converted_to_course = 1 WHERE id = ?').run(existing.registration_id);
      }

      return sendJson(res, 200, { followUp: db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(id) });
    }

    // 10. Budgets & Expenses (Section 11)
    if (pathname.match(/^\/api\/budgets\/[^/]+$/) && method === 'PUT') {
      const eventId = pathname.split('/')[3];
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!canViewFinance(currentUser, event)) {
        return sendJson(res, 403, { error: '权限不足：无财务编辑权限' });
      }
      const body = await parseBody(req);
      syncBudgetCosts(eventId);
      db.prepare(`
        UPDATE budgets SET
          expected_income_rm = COALESCE(?, expected_income_rm),
          material_budget_rm = COALESCE(?, material_budget_rm),
          transport_budget_rm = COALESCE(?, transport_budget_rm),
          actual_transport_rm = COALESCE(?, actual_transport_rm),
          venue_budget_rm = COALESCE(?, venue_budget_rm),
          actual_venue_rm = COALESCE(?, actual_venue_rm),
          catering_budget_rm = COALESCE(?, catering_budget_rm),
          actual_catering_rm = COALESCE(?, actual_catering_rm),
          prize_budget_rm = COALESCE(?, prize_budget_rm),
          actual_prize_rm = COALESCE(?, actual_prize_rm),
          marketing_budget_rm = COALESCE(?, marketing_budget_rm),
          actual_marketing_rm = COALESCE(?, actual_marketing_rm),
          other_budget_rm = COALESCE(?, other_budget_rm),
          actual_other_rm = COALESCE(?, actual_other_rm),
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
        WHERE event_id = ?
      `).run(
        body.expected_income_rm !== undefined ? Number(body.expected_income_rm) : null,
        body.material_budget_rm !== undefined ? Number(body.material_budget_rm) : null,
        body.transport_budget_rm !== undefined ? Number(body.transport_budget_rm) : null,
        body.actual_transport_rm !== undefined ? Number(body.actual_transport_rm) : null,
        body.venue_budget_rm !== undefined ? Number(body.venue_budget_rm) : null,
        body.actual_venue_rm !== undefined ? Number(body.actual_venue_rm) : null,
        body.catering_budget_rm !== undefined ? Number(body.catering_budget_rm) : null,
        body.actual_catering_rm !== undefined ? Number(body.actual_catering_rm) : null,
        body.prize_budget_rm !== undefined ? Number(body.prize_budget_rm) : null,
        body.actual_prize_rm !== undefined ? Number(body.actual_prize_rm) : null,
        body.marketing_budget_rm !== undefined ? Number(body.marketing_budget_rm) : null,
        body.actual_marketing_rm !== undefined ? Number(body.actual_marketing_rm) : null,
        body.other_budget_rm !== undefined ? Number(body.other_budget_rm) : null,
        body.actual_other_rm !== undefined ? Number(body.actual_other_rm) : null,
        body.notes ?? null,
        eventId
      );
      logAudit(currentUser, eventId, '费用与预算', '更新活动预算表', `更新活动预算与实际开支`);
      return sendJson(res, 200, { budget: db.prepare('SELECT * FROM budgets WHERE event_id = ?').get(eventId) });
    }

    if (pathname === '/api/expenses' && method === 'POST') {
      const body = await parseBody(req);
      const id = uid('exp');
      const amt = Number(body.amount_rm) || 0;
      const cat = body.category || '其他开支';
      db.prepare(`
        INSERT INTO expenses (id, event_id, category, title, amount_rm, paid_by, expense_date, receipt_url, receipt_name, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, body.event_id, cat, body.title, amt,
        body.paid_by || currentUser.name, body.expense_date || new Date().toISOString().slice(0, 10),
        body.receipt_url || '', body.receipt_name || '', body.status || '已核销', body.notes || ''
      );

      // Automatically update corresponding actual category in budgets
      syncBudgetCosts(body.event_id);
      const colMap = {
        '运输费用': 'actual_transport_rm',
        '场地费用': 'actual_venue_rm',
        '餐饮费用': 'actual_catering_rm',
        '奖品费用': 'actual_prize_rm',
        '宣传费用': 'actual_marketing_rm',
        '其他开支': 'actual_other_rm'
      };
      if (colMap[cat]) {
        const col = colMap[cat];
        db.prepare(`UPDATE budgets SET ${col} = ${col} + ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?`).run(amt, body.event_id);
      }

      logAudit(currentUser, body.event_id, '费用与预算', '新增费用支出', `${cat}: ${body.title} RM${amt}`);
      return sendJson(res, 201, { expense: db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) });
    }

    // 11. Event Review & Post-Mortem (Section 13)
    if (pathname.match(/^\/api\/events\/[^/]+\/review$/) && method === 'POST') {
      const eventId = pathname.split('/')[3];
      const body = await parseBody(req);
      const existing = db.prepare('SELECT * FROM event_reviews WHERE event_id = ?').get(eventId);
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

      if (existing) {
        db.prepare(`
          UPDATE event_reviews SET
            what_went_well = ?, problems_encountered = ?, materials_shortage = ?, materials_excess = ?,
            effective_channels = ?, unsmooth_arrangements = ?, parent_feedback_summary = ?, student_feedback_summary = ?,
            improvements_next_time = ?, score_prep_efficiency = ?, score_teacher_execution = ?, score_student_participation = ?,
            score_parent_feedback = ?, score_material_prep = ?, score_budget_control = ?, score_overall_effect = ?,
            custom_scores_json = ?, save_as_reference = ?, reviewed_by = ?, reviewed_at = ?
          WHERE event_id = ?
        `).run(
          body.what_went_well || '', body.problems_encountered || '', body.materials_shortage || '', body.materials_excess || '',
          body.effective_channels || '', body.unsmooth_arrangements || '', body.parent_feedback_summary || '', body.student_feedback_summary || '',
          body.improvements_next_time || '',
          Number(body.score_prep_efficiency) || 0, Number(body.score_teacher_execution) || 0, Number(body.score_student_participation) || 0,
          Number(body.score_parent_feedback) || 0, Number(body.score_material_prep) || 0, Number(body.score_budget_control) || 0, Number(body.score_overall_effect) || 0,
          JSON.stringify(body.custom_scores || []), body.save_as_reference !== undefined ? (body.save_as_reference ? 1 : 0) : 1,
          currentUser.name, nowStr, eventId
        );
      } else {
        db.prepare(`
          INSERT INTO event_reviews (
            id, event_id, what_went_well, problems_encountered, materials_shortage, materials_excess,
            effective_channels, unsmooth_arrangements, parent_feedback_summary, student_feedback_summary,
            improvements_next_time, score_prep_efficiency, score_teacher_execution, score_student_participation,
            score_parent_feedback, score_material_prep, score_budget_control, score_overall_effect,
            custom_scores_json, save_as_reference, reviewed_by, reviewed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uid('rev'), eventId,
          body.what_went_well || '', body.problems_encountered || '', body.materials_shortage || '', body.materials_excess || '',
          body.effective_channels || '', body.unsmooth_arrangements || '', body.parent_feedback_summary || '', body.student_feedback_summary || '',
          body.improvements_next_time || '',
          Number(body.score_prep_efficiency) || 0, Number(body.score_teacher_execution) || 0, Number(body.score_student_participation) || 0,
          Number(body.score_parent_feedback) || 0, Number(body.score_material_prep) || 0, Number(body.score_budget_control) || 0, Number(body.score_overall_effect) || 0,
          JSON.stringify(body.custom_scores || []), body.save_as_reference !== undefined ? (body.save_as_reference ? 1 : 0) : 1,
          currentUser.name, nowStr
        );
      }

      if (body.archive_event) {
        db.prepare("UPDATE events SET status = '已归档', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(eventId);
      }

      logAudit(currentUser, eventId, '活动总结与复盘', '保存复盘报告', body.archive_event ? '完成复盘并归档活动' : '更新复盘报告');
      return sendJson(res, 200, { review: db.prepare('SELECT * FROM event_reviews WHERE event_id = ?').get(eventId) });
    }

    // 12. Attachments & Asset Center (Section 14)
    if (pathname === '/api/attachments' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.event_id || !body.original_name) {
        return sendJson(res, 400, { error: '请填写文件或链接名称' });
      }
      const id = uid('att');
      db.prepare(`
        INSERT INTO attachments (id, event_id, category, original_name, file_type, file_url, file_size, uploaded_by, uploaded_by_name, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, body.event_id, body.category || '其他附件', body.original_name,
        body.file_type || 'file', body.file_url || '#', body.file_size || '250 KB',
        currentUser.id, currentUser.name, body.notes || ''
      );
      logAudit(currentUser, body.event_id, '文件与素材中心', '上传附件/素材', `${body.category}: ${body.original_name}`);
      return sendJson(res, 201, { attachment: db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) });
    }

    if (pathname.match(/^\/api\/attachments\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      const existing = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: '文件不存在' });
      if (currentUser.role_id === 'teacher' && existing.uploaded_by !== currentUser.id) {
        return sendJson(res, 403, { error: '权限不足：普通老师不能删除其他人上传的素材' });
      }
      db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
      return sendJson(res, 200, { deleted: true });
    }

    // 13. Analytics & Smart Insights (Section 18.3)
    if (pathname === '/api/analytics' && method === 'GET') {
      const events = db.prepare('SELECT * FROM events ORDER BY start_date ASC').all();
      if (events.length === 0) {
        return sendJson(res, 200, { insufficient_data: true, message: '数据不足' });
      }

      // 1. Attendance by Category
      const catStats = db.prepare(`
        SELECT e.category, COUNT(DISTINCT e.id) as event_count,
               SUM(e.expected_students) as total_expected,
               (SELECT COUNT(*) FROM registrations r WHERE r.event_id IN (SELECT id FROM events e2 WHERE e2.category = e.category) AND r.status = '已报名') as total_registered
        FROM events e
        GROUP BY e.category
      `).all();

      // 2. Marketing Channel Conversion Rates
      const channelStats = db.prepare(`
        SELECT source_name,
               SUM(database_count) as total_db,
               SUM(contacted_count) as total_contacted,
               SUM(registered_count) as total_registered,
               SUM(attended_count) as total_attended,
               SUM(success_count) as total_success
        FROM marketing_sources
        GROUP BY source_name
        ORDER BY total_success DESC
      `).all().map(c => ({
        ...c,
        conversion_rate: c.total_registered > 0 ? Number(((c.total_success / c.total_registered) * 100).toFixed(1)) : 0
      }));

      // 3. Frequently Delayed / Uncompleted Tasks
      const today = new Date().toISOString().slice(0, 10);
      const delayedTasks = db.prepare(`
        SELECT title, stage, COUNT(*) as delay_count
        FROM event_checklist_items
        WHERE is_checked = 0 AND status != '已完成' AND status != '不适用' AND due_date != '' AND due_date < ?
        GROUP BY title, stage
        ORDER BY delay_count DESC
        LIMIT 8
      `).all(today);

      // 4. Repeatedly Procured Materials
      const repeatMaterials = db.prepare(`
        SELECT name, category, unit, COUNT(DISTINCT event_id) as event_count,
               SUM(total_required_qty) as total_req, SUM(need_purchase_qty) as total_bought,
               SUM(final_actual_cost) as total_spent
        FROM event_material_requirements
        GROUP BY name
        ORDER BY event_count DESC, total_spent DESC
      `).all();

      // 5. Monthly Event Distribution
      const monthlyDist = db.prepare(`
        SELECT year, month, COUNT(*) as event_count
        FROM events
        GROUP BY year, month
        ORDER BY year ASC, month ASC
      `).all();

      // 6. Event Cost & Income Trend
      const costTrends = events.map(ev => {
        const s = computeEventSummaryAndRisks(ev);
        return {
          event_code: ev.event_code,
          name: ev.name,
          date: ev.start_date,
          budget_rm: ev.budget_rm,
          actual_cost_rm: s.actualTotalCost,
          actual_income_rm: s.totalPaidIncome,
          net_balance_rm: s.netBalanceRm
        };
      });

      const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();

      return sendJson(res, 200, {
        insufficient_data: false,
        total_events: events.length,
        catStats,
        channelStats,
        delayedTasks,
        repeatMaterials,
        monthlyDist,
        costTrends,
        auditLogs
      });
    }

    // 14. Database Backup & Restore (Section 19)
    if (pathname === '/api/system/backup' && method === 'GET') {
      const tables = [
        'roles', 'users', 'event_templates', 'checklist_templates', 'events',
        'event_checklist_items', 'checklist_execution_logs', 'approvals', 'tasks',
        'materials', 'inventory_transactions', 'event_material_requirements',
        'event_schedules', 'registrations', 'payments', 'marketing_sources',
        'follow_ups', 'budgets', 'expenses', 'attachments', 'event_reviews', 'audit_logs'
      ];
      const dump = { exported_at: new Date().toISOString(), system: '5+1 Event Management & SOP', data: {} };
      for (const tbl of tables) {
        dump.data[tbl] = db.prepare(`SELECT * FROM ${tbl}`).all();
      }
      logAudit(currentUser, '', '系统设置', '导出数据库备份', '生成全量JSON数据库备份');
      return sendJson(res, 200, dump);
    }

    return sendJson(res, 404, { error: `API endpoint not found: ${method} ${pathname}` });
  } catch (err) {
    console.error('API Error:', err);
    return sendJson(res, 500, { error: err.message || '服务器内部错误' });
  }
}

const publicDir = path.join(__dirname, '..', 'public');

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || '/';

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, parsedUrl);
  }

  let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(publicDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    }
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`5+1 Event Management & SOP Server running on http://localhost:${PORT}`);
    console.log(`SQLite Database persisted at: ${dbPath}`);
  });
}

module.exports = { server, db };
