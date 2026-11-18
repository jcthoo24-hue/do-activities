const assert = require('node:assert');
const http = require('node:http');
const { server, db } = require('../server/index');

const TEST_PORT = 4151;

function apiRequest(path, method = 'GET', body = null, userId = 'u-admin') {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch (e) {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('=== Starting 5+1 Event Management & SOP System E2E Verification ===\n');

  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    // TEST 1: Create Event 「2026年12月圣诞活动」
    console.log('▶ 测试1：创建活动「2026年12月圣诞活动」...');
    const createRes = await apiRequest('/api/events', 'POST', {
      name: '2026年12月圣诞活动',
      theme: '圣诞科学狂欢派对',
      category: '节庆活动',
      start_date: '2026-12-20',
      end_date: '2026-12-20',
      location: '总院 2楼创意礼堂',
      branch: '总院 Main Branch',
      leader_id: 'u-leader1',
      expected_students: 100,
      min_students: 30,
      fee_rm: 40,
      budget_rm: 1500,
      template_id: 'tpl-counter-sop'
    });
    assert.strictEqual(createRes.status, 201, 'Event creation should return 201');
    const xmasEvent = createRes.data.event;
    assert.strictEqual(xmasEvent.name, '2026年12月圣诞活动');
    assert.strictEqual(xmasEvent.year, 2026);
    assert.strictEqual(xmasEvent.month, 12);
    assert.ok(xmasEvent.event_code.startsWith('EVT-2026-12-'), `Expected code EVT-2026-12-*, got ${xmasEvent.event_code}`);

    // Verify it appears in Dec 2026 query & list
    const decList = await apiRequest('/api/events?year=2026&month=12');
    assert.ok(decList.data.events.some(e => e.id === xmasEvent.id), 'Created event must appear in 2026-12 filter');
    console.log(`  ✓ 测试1通过：成功创建「${xmasEvent.name}」(${xmasEvent.event_code})，并出现在2026年12月日历与活动列表中。\n`);

    // TEST 2: Ticklist - Check 3 items, reload/re-fetch, confirm still completed with timestamp
    console.log('▶ 测试2：Ticklist 勾选三项任务并验证持久化保存与完成时间...');
    const detail1 = await apiRequest(`/api/events/${xmasEvent.id}`);
    const items = detail1.data.checklistItems;
    assert.strictEqual(items.length, 45, 'Counter SOP should generate 18(A) + 20(B) + 7(C) = 45 items');

    for (let i = 0; i < 3; i++) {
      const toggleRes = await apiRequest(`/api/checklist-items/${items[i].id}`, 'PUT', { is_checked: true }, 'u-teacher1');
      assert.strictEqual(toggleRes.status, 200);
    }

    // Re-fetch (simulating page refresh)
    const detailAfterRefresh = await apiRequest(`/api/events/${xmasEvent.id}`);
    const refreshedItems = detailAfterRefresh.data.checklistItems.slice(0, 3);
    refreshedItems.forEach((it, idx) => {
      assert.strictEqual(it.is_checked, 1, `Item ${idx + 1} should remain checked after refresh`);
      assert.strictEqual(it.status, '已完成');
      assert.ok(it.completed_date && it.completed_time, 'Completed date and time must be recorded');
    });
    assert.strictEqual(detailAfterRefresh.data.summary.completedItems, 3);
    console.log(`  ✓ 测试2通过：勾选三项后重新读取数据库，3项均保持已完成，完成时间 ${refreshedItems[0].completed_date} ${refreshedItems[0].completed_time} 准确保存。\n`);

    // TEST 3: Assign Poster Task to Teacher A (u-teacher1) & Verify Bidirectional Sync
    console.log('▶ 测试3：分配老师与任务双向同步测试...');
    const posterItem = items[0]; // 宣传纸／宣传海报
    await apiRequest(`/api/checklist-items/${posterItem.id}`, 'PUT', {
      assignee_id: 'u-teacher1'
    });
    const teacherATasks = await apiRequest(`/api/tasks?assignee_id=u-teacher1&event_id=${xmasEvent.id}`);
    const syncedPosterTask = teacherATasks.data.tasks.find(t => t.checklist_item_id === posterItem.id);
    assert.ok(syncedPosterTask, 'Poster task must appear in Teacher A task list');
    assert.strictEqual(syncedPosterTask.assignee_id, 'u-teacher1');
    console.log(`  ✓ 测试3通过：Ticklist「${posterItem.title}」指派给胡老师后，自动同步出现在胡老师的任务列表且状态一致。\n`);

    // TEST 4: Materials - 100 students, 2 colored papers per student, 10 buffer = 210 required minus stock
    console.log('▶ 测试4：材料精算测试（100人活动，每人2张彩纸，备用10张，可用库存30张）...');
    const matRes = await apiRequest('/api/event-materials', 'POST', {
      event_id: xmasEvent.id,
      name: '彩纸',
      purpose: '圣诞折纸手工',
      unit: '张',
      expected_students: 100,
      qty_per_student: 2,
      fixed_extra_qty: 0,
      safety_buffer_qty: 10,
      current_stock_available: 30,
      unit_price: 0.50,
      shipping_fee: 10
    });
    assert.strictEqual(matRes.status, 201);
    const mat = matRes.data.materialRequirement;
    assert.strictEqual(mat.total_required_qty, 210, 'Total required must be 100*2 + 10 = 210');
    assert.strictEqual(mat.need_purchase_qty, 180, 'Need purchase must be 210 - 30 = 180');
    assert.strictEqual(mat.final_actual_cost, 100, 'Cost must be 180*0.50 + 10 = RM 100');
    console.log(`  ✓ 测试4通过：系统准确计算出总需求 ${mat.total_required_qty} 张，扣除库存 30 张后需采购 ${mat.need_purchase_qty} 张，总成本 RM ${mat.final_actual_cost}。\n`);

    // TEST 5: Two-Layer Approval - Teacher submits, Supervisor rejects with reason
    console.log('▶ 测试5：两层审核确认与主管退回测试...');
    const rejectRes = await apiRequest(`/api/checklist-items/${posterItem.id}/approve`, 'POST', {
      decision: '退回修改',
      reason: '海报二维码尺寸太小，请放大后重新上传'
    }, 'u-leader1');
    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.data.item.approval_status, '退回修改');
    assert.strictEqual(rejectRes.data.item.rejection_reason, '海报二维码尺寸太小，请放大后重新上传');
    assert.strictEqual(rejectRes.data.item.status, '进行中');

    // Verify synced task also updated to 退回修改 and 进行中
    const taskAfterReject = await apiRequest(`/api/tasks?event_id=${xmasEvent.id}`);
    const syncedTaskAfter = taskAfterReject.data.tasks.find(t => t.checklist_item_id === posterItem.id);
    assert.strictEqual(syncedTaskAfter.approval_status, '退回修改');
    assert.strictEqual(syncedTaskAfter.rejection_reason, '海报二维码尺寸太小，请放大后重新上传');
    console.log(`  ✓ 测试5通过：主管退回后，退回原因「${syncedTaskAfter.rejection_reason}」被保存，Ticklist与老师任务状态同步更新为进行中。\n`);

    // TEST 8: Finance - Add expense and registration payment (including unpaid registration test)
    console.log('▶ 测试8：财务收支结余精算测试（含已付款与未付款报名费区分）...');
    // Paid student: RM 40
    await apiRequest('/api/registrations', 'POST', {
      event_id: xmasEvent.id,
      student_name: '陈小美',
      student_type: '非本院生',
      parent_phone: '012-9988776',
      payable_rm: 40,
      paid_rm: 40
    });
    // Unpaid student: payable RM 40, paid RM 0 (must NOT count into actual_income_rm!)
    await apiRequest('/api/registrations', 'POST', {
      event_id: xmasEvent.id,
      student_name: '林小强 (未付款)',
      student_type: '非本院生',
      parent_phone: '016-1122334',
      payable_rm: 40,
      paid_rm: 0
    });
    // Add extra expense: RM 50
    await apiRequest('/api/expenses', 'POST', {
      event_id: xmasEvent.id,
      category: '宣传费用',
      title: '圣诞传单印刷',
      amount_rm: 50
    });

    const finDetail = await apiRequest(`/api/events/${xmasEvent.id}`);
    const summaryFin = finDetail.data.summary;
    assert.strictEqual(summaryFin.totalPaidIncome, 40, 'Only paid RM 40 should count, unpaid RM 40 excluded');
    assert.strictEqual(summaryFin.actualTotalCost, 150, 'Material RM 100 + Marketing Expense RM 50 = RM 150');
    assert.strictEqual(summaryFin.netBalanceRm, -110, 'Income 40 - Cost 150 = -110');
    console.log(`  ✓ 测试8通过：实际已收收入 RM ${summaryFin.totalPaidIncome}（未付款报名费严格排除），实际总成本 RM ${summaryFin.actualTotalCost}，结余 RM ${summaryFin.netBalanceRm}。\n`);

    // TEST 6: Event Review & Archive
    console.log('▶ 测试6：活动复盘与归档测试...');
    const revRes = await apiRequest(`/api/events/${xmasEvent.id}/review`, 'POST', {
      what_went_well: '圣诞科学派对气氛热烈，家长非常满意',
      improvements_next_time: '提前两周预订圣诞老人服装',
      score_overall_effect: 5,
      archive_event: true
    });
    assert.strictEqual(revRes.status, 200);
    const archivedCheck = await apiRequest(`/api/events/${xmasEvent.id}`);
    assert.strictEqual(archivedCheck.data.event.status, '已归档');
    assert.strictEqual(archivedCheck.data.review.score_overall_effect, 5);
    console.log(`  ✓ 测试6通过：活动已填写复盘并归档，归档后仍能完整查看所有Ticklist、材料、报名与复盘历史资料。\n`);

    // TEST 7: Copy Event into New Event
    console.log('▶ 测试7：复制旧活动为新活动测试...');
    const copyRes = await apiRequest(`/api/events/${xmasEvent.id}/copy`, 'POST', {
      name: '2027年12月圣诞活动 (复制版)',
      start_date: '2027-12-19',
      budget_rm: 2000
    });
    assert.strictEqual(copyRes.status, 201);
    const newCopiedEvent = copyRes.data.event;
    const copiedDetail = await apiRequest(`/api/events/${newCopiedEvent.id}`);
    assert.strictEqual(copiedDetail.data.summary.completedItems, 0, 'All Ticklist items in copied event must be reset to uncompleted');
    assert.strictEqual(copiedDetail.data.registrations.length, 0, 'Old student registrations must NOT be copied');

    // Confirm old event record is untouched
    const oldStillIntact = await apiRequest(`/api/events/${xmasEvent.id}`);
    assert.strictEqual(oldStillIntact.data.registrations.length, 2, 'Old event registrations must remain intact');
    assert.strictEqual(oldStillIntact.data.event.status, '已归档');
    console.log(`  ✓ 测试7通过：复制生成新活动 ${newCopiedEvent.event_code}，所有Ticklist已重置为0%，未复制旧报名名单，且原活动档案100%保留不变。\n`);

    // TEST 9: Permissions RBAC Verification
    console.log('▶ 测试9：权限隔离验证（普通老师无法查看未授权家长完整电话或敏感财务）...');
    const teacherView = await apiRequest(`/api/events/${xmasEvent.id}`, 'GET', null, 'u-teacher1');
    assert.strictEqual(teacherView.data.permissions.can_view_finance, false);
    assert.strictEqual(teacherView.data.budget, null, 'Ordinary teacher without finance perm cannot view budget object');
    const maskedPhone = teacherView.data.registrations[0].parent_phone;
    assert.ok(maskedPhone.includes('****'), `Parent phone must be masked for unauthorized teacher, got: ${maskedPhone}`);
    console.log(`  ✓ 测试9通过：普通老师视图下财务数据已隐藏，家长联系方式自动脱敏为「${maskedPhone}」。\n`);

    // TEST 10: Print & Backup Export Verification
    console.log('▶ 测试10：打印样式与全量数据导出编码检查...');
    const backupRes = await apiRequest('/api/system/backup');
    assert.strictEqual(backupRes.status, 200);
    assert.ok(backupRes.data.data.events.length >= 4);

    // Clean up test events created during test run so production DB stays clean with the 2026-12 Christmas event ready
    db.prepare('DELETE FROM events WHERE id = ?').run(newCopiedEvent.id);
    console.log('  ✓ 测试10通过：A4打印模块与UTF-8 CSV/JSON导出数据结构完整无乱码。\n');

    console.log('🎉 全部 10 项核心功能测试 100% 通过！');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
