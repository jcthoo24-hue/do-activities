(function() {
  const STORAGE_KEY = '5plus1_sop_standalone_db_v1';
  const uid = (p = 'id') => p + '-' + Math.random().toString(36).slice(2, 10);
  const addDays = (dateStr, days) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const STAGE_A = [
    { sort: 1, title: '宣传纸／宣传海报', offset: -30, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 2, title: 'Video 宣传视频', offset: -28, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 3, title: 'Send 本院家长 Group（关键话）', offset: -25, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 4, title: 'Send Phonebank', offset: -21, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 5, title: 'Send 停补生', offset: -21, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 6, title: 'Post FB / IG / 小红书 / FB吹水站', offset: -21, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 7, title: 'Call 本院兄弟姐妹', offset: -18, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 8, title: 'Call 停补生', offset: -16, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 9, title: 'Call Phonebank', offset: -14, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 10, title: 'Call 高效', offset: -14, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 11, title: '班上推广 Video / Show 实物', offset: -14, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 12, title: '派送友券（小老板＋优惠）', offset: -12, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 13, title: '派传单', offset: -10, req: 0, repeat: 1, tag: '原版SOP' },
    { sort: 14, title: '电视机宣传', offset: -14, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 15, title: '布条宣传', offset: -14, req: 0, repeat: 0, tag: '原版SOP' },
    { sort: 16, title: '提醒老师 Forward 给相关家长', offset: -7, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 17, title: '逢人就讲（关键话让家长转发）', offset: -7, req: 1, repeat: 1, tag: '原版SOP' },
    { sort: 18, title: '印报名表格的票／报名纸条', offset: -20, req: 1, repeat: 0, tag: '原版SOP' }
  ];
  const STAGE_B = [
    { sort: 1, title: '意见表（与老师的表格链接／内容）', offset: 0, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 2, title: 'Close 非本院动作', offset: 0, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 3, title: '温馨提醒 Msg、约时间', offset: -1, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 4, title: '提高曝光率（与讲师合作）', offset: 0, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 5, title: '认识学生、Follow IG', offset: 0, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 6, title: '免费体验课时间表 & Voucher', offset: 0, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 7, title: '用心小礼物', offset: 0, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 8, title: '合照 Send 本院／非本院', offset: 0, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 9, title: '非本院名字牌', offset: 0, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 10, title: '了解活动内容（专业度）', offset: -1, req: 1, repeat: 0, tag: '原版SOP' },
    { sort: 11, title: '【现场准备】场地布置', offset: 0, req: 1, repeat: 0, tag: '现场准备扩展' },
    { sort: 12, title: '【现场准备】签到处布置与名单核对', offset: 0, req: 1, repeat: 0, tag: '现场准备扩展' },
    { sort: 13, title: '【现场准备】材料分配', offset: 0, req: 1, repeat: 0, tag: '现场准备扩展' },
    { sort: 14, title: '【现场准备】学生点名', offset: 0, req: 1, repeat: 0, tag: '现场准备扩展' },
    { sort: 15, title: '【现场准备】活动流程检查', offset: 0, req: 1, repeat: 0, tag: '现场准备扩展' },
    { sort: 16, title: '【现场准备】设备测试（音响/投影/麦克风）', offset: 0, req: 1, repeat: 0, tag: '现场准备扩展' },
    { sort: 17, title: '【现场准备】安全检查（场地/通道/急救箱）', offset: 0, req: 1, repeat: 0, tag: '现场准备扩展' },
    { sort: 18, title: '【现场准备】活动拍照与录像安排', offset: 0, req: 1, repeat: 0, tag: '现场准备扩展' },
    { sort: 19, title: '【现场准备】现场收拾与还原', offset: 0, req: 0, repeat: 0, tag: '现场准备扩展' },
    { sort: 20, title: '【现场准备】离场核对（学生接送与物资清点）', offset: 0, req: 1, repeat: 0, tag: '现场准备扩展' }
  ];
  const STAGE_C = [
    { sort: 1, title: 'Step 1：感谢参加活动、说明活动意义、鼓励转发朋友、邀友福利。', offset: 1, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
    { sort: 2, title: 'Step 2：了解 IG、兴趣爱好及学校表现。', offset: 2, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
    { sort: 3, title: 'Step 3：Sharing 教材，例如 Lesson Plan / Busy Bag / Test，针对科目 T-UP。', offset: 3, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
    { sort: 4, title: 'Step 4：了解学习情况，邀请一起复习或学习。', offset: 4, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
    { sort: 5, title: 'Step 5：询问本院课程上课时间，鼓励一起来。', offset: 5, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
    { sort: 6, title: 'Step 6：科目时间、现场安排、温馨提醒。', offset: 6, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
    { sort: 7, title: 'Step 7：Post Group 报告。', offset: 7, req: 1, repeat: 0, tag: 'Close跟进7步骤' }
  ];

  function initStore() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);

    const users = [
      { id: 'u-admin', username: 'admin', name: '陈院长 (Principal Tan)', role_id: 'admin', branch: '总院 Main Branch', phone: '012-3456789', can_view_finance: 1, can_view_sensitive_contacts: 1 },
      { id: 'u-leader1', username: 'lin', name: '林主管 (Ms. Lim)', role_id: 'leader', branch: '总院 Main Branch', phone: '016-8889900', can_view_finance: 1, can_view_sensitive_contacts: 1 },
      { id: 'u-leader2', username: 'wong', name: '黄主任 (Mr. Wong)', role_id: 'leader', branch: 'Setia Alam 分行', phone: '017-2233445', can_view_finance: 0, can_view_sensitive_contacts: 1 },
      { id: 'u-teacher1', username: 'hu', name: '胡老师 (Teacher Hu)', role_id: 'teacher', branch: '总院 Main Branch', phone: '018-3344556', can_view_finance: 0, can_view_sensitive_contacts: 0 },
      { id: 'u-teacher2', username: 'zhang', name: '张老师 (Teacher Chong)', role_id: 'teacher', branch: '总院 Main Branch', phone: '019-4455667', can_view_finance: 0, can_view_sensitive_contacts: 0 }
    ];

    const templates = [
      { id: 'tpl-counter-sop', name: '使用原版 Counter SOP', code: 'COUNTER_SOP', category: '通用标准SOP', description: '完整包含5+1原版纸本Counter SOP（阶段A 18项、阶段B 20项、阶段C 7步骤）', items: [] },
      { id: 'tpl-holiday', name: '使用假期活动模板', code: 'HOLIDAY_SOP', category: '假期活动', description: '适用于学校假期营、科学手作营', items: [] },
      { id: 'tpl-outing', name: '使用出游活动模板', code: 'OUTING_SOP', category: '学生出游', description: '适用于户外考察、科学馆参访', items: [] },
      { id: 'tpl-festival', name: '使用节庆活动模板', code: 'FESTIVAL_SOP', category: '节庆活动', description: '适用于新春、中秋、万圣节、圣诞派对', items: [] },
      { id: 'tpl-competition', name: '使用比赛活动模板', code: 'COMPETITION_SOP', category: '学生比赛', description: '适用于数学竞赛、演讲比赛', items: [] },
      { id: 'tpl-blank', name: '空白模板', code: 'BLANK_SOP', category: '其他自定义活动', description: '保留A/B/C三阶段结构，自由新增项目', items: [] }
    ];

    const materials = [
      { id: 'mat-mask', name: '空白立体动物面具胚', category: '手工美术', unit: '个', total_stock: 35, reserved_stock: 15, default_unit_price: 2.50, supplier_id: 'Shopee 美术批发部', notes: '森林王国神秘面具活动主材料' },
      { id: 'mat-leaf', name: '仿真森林树叶包（混色）', category: '手工美术', unit: '包', total_stock: 20, reserved_stock: 5, default_unit_price: 4.80, supplier_id: '淘宝森系手作店', notes: '每包50片' },
      { id: 'mat-tape', name: '强力泡棉双面胶', category: '文具耗材', unit: '卷', total_stock: 40, reserved_stock: 10, default_unit_price: 1.80, supplier_id: 'Popular 大众书局', notes: '共用耗材' },
      { id: 'mat-deco', name: '森林宝石与羽毛装饰包', category: '手工美术', unit: '套', total_stock: 25, reserved_stock: 0, default_unit_price: 3.20, supplier_id: '淘宝森系手作店', notes: '亮片羽毛组合' }
    ];

    const store = {
      users,
      roles: [
        { id: 'admin', name: 'Admin／院长' },
        { id: 'leader', name: '活动负责人' },
        { id: 'teacher', name: '老师' }
      ],
      templates,
      events: [],
      checklistItems: [],
      tasks: [],
      materials,
      inventoryTransactions: [],
      eventMaterials: [],
      schedules: [],
      registrations: [],
      marketingSources: [],
      followUps: [],
      budgets: [],
      expenses: [],
      attachments: [],
      reviews: [],
      executionLogs: [],
      approvals: [],
      auditLogs: []
    };

    function addSampleEvent(ev, isPast) {
      store.events.push({
        ...ev,
        followup_completed: isPast ? 1 : 0,
        readiness_override_reason: '',
        level1_name: 'Level 1 非本院出席目标',
        level1_definition: '非本院实际到场人数',
        level1_target: 30,
        level2_name: 'Level 2 课程转化目标',
        level2_definition: '活动后报读常规班人数',
        level2_target: 12,
        milestone_nodes: {
          promo_start: addDays(ev.start_date, -30),
          check_reg_procure: addDays(ev.start_date, -14),
          check_arrival_flow: addDays(ev.start_date, -7),
          final_check: addDays(ev.start_date, -1),
          event_day: ev.start_date,
          followup_review: addDays(ev.start_date, 7)
        }
      });

      const teachers = ['u-leader1', 'u-teacher1', 'u-teacher2'];
      const all = [
        ...STAGE_A.map(x => ({ ...x, stage: 'A' })),
        ...STAGE_B.map(x => ({ ...x, stage: 'B' })),
        ...STAGE_C.map(x => ({ ...x, stage: 'C' }))
      ];
      all.forEach((item, idx) => {
        const chkId = uid('chk');
        const assignee = teachers[idx % teachers.length];
        const dueDate = addDays(ev.start_date, item.offset);
        const checked = isPast || (item.stage === 'A' && item.sort <= 6) ? 1 : 0;
        const status = checked ? '已完成' : (item.stage === 'A' && item.sort <= 10 ? '进行中' : '未开始');
        const appStatus = isPast ? '审核通过' : (checked ? (item.sort <= 4 ? '审核通过' : '待审核') : '待提交');
        const repeats = item.repeat ? [
          { round: '第一次发布/执行', date: addDays(ev.start_date, -25), assignee: '胡老师', result: checked ? '已发布家长群' : '', completed: !!checked },
          { round: '第二次发布/执行', date: addDays(ev.start_date, -14), assignee: '张老师', result: isPast ? '二次跟进' : '', completed: !!isPast },
          { round: '第三次发布/执行', date: addDays(ev.start_date, -5), assignee: '林主管', result: '', completed: !!isPast }
        ] : [];

        store.checklistItems.push({
          id: chkId, event_id: ev.id, stage: item.stage, sort_order: item.sort,
          title: item.title, category_tag: item.tag, assignee_id: assignee,
          due_date: dueDate, days_offset: item.offset,
          completed_date: checked ? '2026-11-10' : '', completed_time: checked ? '14:20:00' : '',
          completed_by: checked ? assignee : '', status, is_checked: checked,
          is_required: item.req, allow_repeat: item.repeat, repeat_records: repeats,
          notes: checked ? '已按5+1 SOP标准完成' : '', approval_status: appStatus,
          reviewer_id: appStatus === '审核通过' ? 'u-admin' : '',
          reviewed_at: appStatus === '审核通过' ? '2026-11-11 10:00:00' : '',
          rejection_reason: ''
        });

        store.tasks.push({
          id: uid('tsk'), event_id: ev.id, checklist_item_id: chkId,
          title: item.title, stage: item.stage, assignee_id: assignee,
          due_date: dueDate, priority: item.req ? '高' : '中', status,
          approval_status: appStatus, notes: '', rejection_reason: ''
        });
      });

      ['Send Phonebank', 'Send 停补生', '本院兄弟姐妹', '小老板'].forEach((sName, idx) => {
        store.marketingSources.push({
          id: uid('src'), event_id: ev.id, source_name: sName, sort_order: idx + 1,
          database_count: 100 - idx * 15, contacted_count: 80 - idx * 10,
          responded_count: 35 - idx * 5, registered_count: 12 - idx * 2,
          attended_count: 10 - idx * 2, success_count: 5 - idx,
          conversion_rate: 40, assignee_id: 'u-teacher1'
        });
      });

      store.schedules.push(
        { id: uid('ros'), event_id: ev.id, sort_order: 1, start_time: '13:00', end_time: '13:15', title: '学生签到 & 派发非本院名字牌', assignee_id: 'u-teacher2', materials_needed: '签到表、名牌', venue: '1楼接待处', instructions: '热情接待', precautions: '核对名单', status: isPast ? '已完成' : '未开始', is_completed: isPast ? 1 : 0 },
        { id: uid('ros'), event_id: ev.id, sort_order: 2, start_time: '13:15', end_time: '14:30', title: '主题实作与闯关挑战', assignee_id: 'u-teacher1', materials_needed: '活动材料包', venue: '2楼礼堂', instructions: '拍照发家长群', precautions: '注意安全', status: isPast ? '已完成' : '未开始', is_completed: isPast ? 1 : 0 },
        { id: uid('ros'), event_id: ev.id, sort_order: 3, start_time: '15:00', end_time: '16:00', title: '颁奖、派发体验课Voucher & 大合照', assignee_id: 'u-leader1', materials_needed: '小礼物、Voucher', venue: '2楼礼堂', instructions: '现场Close非本院家长', precautions: '接送核对', status: isPast ? '已完成' : '未开始', is_completed: isPast ? 1 : 0 }
      );

      store.registrations.push(
        { id: uid('reg'), event_id: ev.id, student_name: '林子轩 (Jayden Lim)', grade: '三年级', branch: ev.branch, student_type: '本院生', parent_name: 'Mrs. Lim', parent_phone: '012-3019988', source: '本院家长Group', status: '已报名', payment_method: 'TNG', payable_rm: ev.fee_rm, paid_rm: ev.fee_rm, balance_rm: 0, receipt_no: 'RCP-1001', attended: 1, converted_to_course: 0, notes: '' },
        { id: uid('reg'), event_id: ev.id, student_name: '陈语彤 (Chloe Tan)', grade: '四年级', branch: ev.branch, student_type: '非本院生', parent_name: 'Mr. Tan', parent_phone: '016-7788231', source: 'Send Phonebank', status: '已报名', payment_method: 'TNG', payable_rm: ev.fee_rm, paid_rm: ev.fee_rm, balance_rm: 0, receipt_no: 'RCP-1002', attended: 1, converted_to_course: 1, notes: '对科学班有兴趣' }
      );

      store.budgets.push({
        id: uid('bdg'), event_id: ev.id, expected_income_rm: ev.expected_students * ev.fee_rm,
        material_budget_rm: 650, transport_budget_rm: 100, actual_transport_rm: 45,
        venue_budget_rm: 200, actual_venue_rm: 150, catering_budget_rm: 300, actual_catering_rm: 220,
        prize_budget_rm: 300, actual_prize_rm: 260, marketing_budget_rm: 150, actual_marketing_rm: 120,
        other_budget_rm: 100, actual_other_rm: 40
      });
    }

    addSampleEvent({
      id: 'evt-forest-mask', event_code: 'EVT-2026-11-001', name: '森林王国神秘面具手作营',
      theme: '探索自然美学 · 激发创意潜能', category: '假期活动', year: 2026, month: 11,
      start_date: '2026-11-28', end_date: '2026-11-28', start_time: '13:00', end_time: '16:00',
      location: '总院 2楼创意礼堂', branch: '总院 Main Branch', leader_id: 'u-leader1',
      expected_students: 100, min_students: 40, actual_students: 42, fee_rm: 35, budget_rm: 1800,
      goals: '招收100人，非本院生至少35人，转化12人报读常规班', status: '宣传中'
    }, false);

    store.eventMaterials.push(
      { id: uid('req'), event_id: 'evt-forest-mask', name: '森林动物立体面具胚', purpose: '主手作基底', buyer_id: 'u-teacher1', category: '手工美术', unit: '个', qty_per_student: 1, fixed_extra_qty: 0, expected_students: 100, safety_buffer_qty: 10, total_required_qty: 110, current_stock_available: 20, need_purchase_qty: 90, unit_price: 2.20, original_price: 2.80, air_freight_price: 2.50, sea_freight_price: 1.90, shipping_fee: 18, final_actual_cost: 216, supplier_name: 'Shopee 美术批发部', procurement_status: '已到货', step_confirmed: 1, step_stock_checked: 1, step_decided_buy: 1, step_ordered: 1, step_paid: 1, step_arrived: 1, step_counted: 1, step_allocated: 0, step_ready: 0, is_critical: 1 },
      { id: uid('req'), event_id: 'evt-forest-mask', name: '仿真森林树叶包（混色50片装）', purpose: '装饰面具', buyer_id: 'u-teacher1', category: '手工美术', unit: '包', qty_per_student: 0.2, fixed_extra_qty: 2, expected_students: 100, safety_buffer_qty: 3, total_required_qty: 25, current_stock_available: 15, need_purchase_qty: 10, unit_price: 4.50, original_price: 5.50, air_freight_price: 4.50, sea_freight_price: 3.60, shipping_fee: 12, final_actual_cost: 57, supplier_name: '淘宝森系手作店', procurement_status: '已下单', step_confirmed: 1, step_stock_checked: 1, step_decided_buy: 1, step_ordered: 1, step_paid: 1, step_arrived: 0, step_counted: 0, step_allocated: 0, step_ready: 0, is_critical: 1 }
    );

    addSampleEvent({
      id: 'evt-science-oct', event_code: 'EVT-2026-10-001', name: '小小科学家：奇幻火山与晶洞实验日',
      theme: '趣味STEM科学实验 · 点燃好奇心', category: '科学实验活动', year: 2026, month: 10,
      start_date: '2026-10-18', end_date: '2026-10-18', start_time: '14:00', end_time: '17:00',
      location: '总院 STEM 实验室', branch: '总院 Main Branch', leader_id: 'u-leader1',
      expected_students: 60, min_students: 30, actual_students: 64, fee_rm: 40, budget_rm: 1200,
      goals: '展示5+1科学实验教学实力，转化10名新生', status: '已归档'
    }, true);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return store;
  }

  function saveStore(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function computeSummary(store, ev) {
    const today = new Date().toISOString().slice(0, 10);
    const items = store.checklistItems.filter(i => i.event_id === ev.id);
    const totalItems = items.length;
    const completedItems = items.filter(i => i.is_checked === 1 || i.status === '已完成').length;
    const applicable = items.filter(i => i.status !== '不适用').length;
    const uncompletedItems = items.filter(i => !i.is_checked && i.status !== '已完成' && i.status !== '不适用').length;
    const overdueItems = items.filter(i => !i.is_checked && i.status !== '已完成' && i.status !== '不适用' && i.due_date && i.due_date < today).length;
    const pendingApprovalItems = items.filter(i => i.approval_status === '待审核' || i.status === '待审核').length;
    const completionPct = applicable > 0 ? Math.round((completedItems / applicable) * 100) : 0;
    const mats = store.eventMaterials.filter(m => m.event_id === ev.id);
    const unreadyMat = mats.filter(m => m.is_critical && !m.step_ready).length;
    const uncompReq = items.filter(i => i.is_required && !i.is_checked && i.status !== '已完成' && i.status !== '不适用').length;
    const regs = store.registrations.filter(r => r.event_id === ev.id);
    const activeRegistrations = regs.filter(r => r.status === '已报名').length;
    const totalPaidIncome = regs.filter(r => r.status === '已报名').reduce((s, r) => s + (Number(r.paid_rm) || 0), 0);
    const totalMaterialCost = mats.reduce((s, m) => s + (Number(m.final_actual_cost) || 0), 0);
    const b = store.budgets.find(x => x.event_id === ev.id) || {};
    const actualTotalCost = totalMaterialCost + (Number(b.actual_transport_rm) || 0) + (Number(b.actual_venue_rm) || 0) + (Number(b.actual_catering_rm) || 0) + (Number(b.actual_prize_rm) || 0) + (Number(b.actual_marketing_rm) || 0) + (Number(b.actual_other_rm) || 0);
    const criticalUnfinishedCount = uncompReq + unreadyMat;
    const risks = [];
    if (overdueItems > 0) risks.push({ level: 'danger', title: '逾期检查项 (' + overdueItems + '项)', detail: '请督促负责老师尽快处理' });
    if (unreadyMat > 0) risks.push({ level: 'warning', title: '关键材料未准备齐全 (' + unreadyMat + '项)', detail: '请检查采购与到货进度' });
    return {
      totalItems, completedItems, uncompletedItems, overdueItems, pendingApprovalItems, completionPct,
      criticalUnfinishedCount, uncompletedRequiredChecklistCount: uncompReq, unreadyCriticalMaterialsCount: unreadyMat,
      isReadyToStart: criticalUnfinishedCount === 0 || !!ev.readiness_override_reason,
      activeRegistrations, attendedCount: regs.filter(r => r.attended).length,
      externalReg: regs.filter(r => r.student_type === '非本院生' && r.status === '已报名').length,
      externalAttended: regs.filter(r => r.student_type === '非本院生' && r.attended).length,
      externalConverted: regs.filter(r => r.student_type === '非本院生' && r.converted_to_course).length,
      totalPaidIncome, totalMaterialCost, actualTotalCost, netBalanceRm: totalPaidIncome - actualTotalCost,
      stageCCompleted: items.filter(i => i.stage === 'C').every(i => i.is_checked || i.status === '已完成'),
      risks
    };
  }

  window.fetch = async function(urlStr, opts = {}) {
    const store = initStore();
    const uId = (opts.headers && opts.headers['X-User-Id']) || 'u-admin';
    const currentUser = store.users.find(u => u.id === uId) || store.users[0];
    const method = (opts.method || 'GET').toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};
    const [pathname, qs] = urlStr.split('?');
    const params = new URLSearchParams(qs || '');
    const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    const usersMap = Object.fromEntries(store.users.map(u => [u.id, u]));

    if (pathname === '/api/users' && method === 'GET') return ok({ users: store.users, roles: store.roles, currentUser });
    if (pathname === '/api/users' && method === 'POST') {
      const nu = { id: uid('u'), ...body, can_view_finance: 0, can_view_sensitive_contacts: 0 };
      store.users.push(nu); saveStore(store); return ok({ user: nu }, 201);
    }
    if (pathname.startsWith('/api/users/') && method === 'PUT') {
      const id = pathname.split('/')[3];
      const u = store.users.find(x => x.id === id);
      if (u) Object.assign(u, body);
      saveStore(store); return ok({ user: u });
    }
    if (pathname === '/api/templates') return ok({ templates: store.templates });
    if (pathname === '/api/events/next-code') {
      const y = params.get('year') || '2026';
      const m = String(params.get('month') || '12').padStart(2, '0');
      const cnt = store.events.filter(e => e.event_code.startsWith(`EVT-${y}-${m}-`)).length + 1;
      return ok({ event_code: `EVT-${y}-${m}-${String(cnt).padStart(3, '0')}` });
    }
    if (pathname === '/api/events' && method === 'GET') {
      let evs = store.events.map(e => ({ ...e, leader_name: usersMap[e.leader_id]?.name || '未指定', summary: computeSummary(store, e) }));
      if (params.get('year')) evs = evs.filter(e => String(e.year) === params.get('year'));
      if (params.get('month')) evs = evs.filter(e => String(e.month) === params.get('month'));
      if (params.get('search')) { const q = params.get('search').toLowerCase(); evs = evs.filter(e => e.name.toLowerCase().includes(q) || e.event_code.toLowerCase().includes(q)); }
      return ok({ events: evs });
    }
    if (pathname === '/api/events' && method === 'POST') {
      const parts = body.start_date.split('-');
      const year = Number(parts[0]), month = Number(parts[1]);
      const id = uid('evt');
      const cnt = store.events.filter(e => e.event_code.startsWith(`EVT-${year}-${String(month).padStart(2, '0')}-`)).length + 1;
      const ev = { id, event_code: `EVT-${year}-${String(month).padStart(2, '0')}-${String(cnt).padStart(3, '0')}`, year, month, ...body, actual_students: 0, level1_name: 'Level 1 非本院出席目标', level1_target: 30, level1_definition: '非本院实际出席人数', level2_name: 'Level 2 课程转化目标', level2_target: 12, level2_definition: '报读常规班人数' };
      store.events.unshift(ev);
      const all = [...STAGE_A.map(x => ({ ...x, stage: 'A' })), ...STAGE_B.map(x => ({ ...x, stage: 'B' })), ...STAGE_C.map(x => ({ ...x, stage: 'C' }))];
      if (body.template_id !== 'tpl-blank') {
        all.forEach(item => {
          const chkId = uid('chk');
          const due = addDays(ev.start_date, item.offset);
          store.checklistItems.push({ id: chkId, event_id: id, stage: item.stage, sort_order: item.sort, title: item.title, category_tag: item.tag, assignee_id: ev.leader_id, due_date: due, status: '未开始', is_checked: 0, is_required: item.req, allow_repeat: item.repeat, repeat_records: item.repeat ? [{ round: '第1次', date: '', assignee: '', result: '', completed: false }, { round: '第2次', date: '', assignee: '', result: '', completed: false }, { round: '第3次', date: '', assignee: '', result: '', completed: false }] : [], notes: '', approval_status: '待提交' });
          store.tasks.push({ id: uid('tsk'), event_id: id, checklist_item_id: chkId, title: item.title, stage: item.stage, assignee_id: ev.leader_id, due_date: due, priority: item.req ? '高' : '中', status: '未开始', approval_status: '待提交' });
        });
      }
      store.budgets.push({ id: uid('bdg'), event_id: id, expected_income_rm: (ev.expected_students || 0) * (ev.fee_rm || 0), material_budget_rm: 500 });
      saveStore(store);
      return ok({ event: ev }, 201);
    }
    if (pathname.match(/^\/api\/events\/[^/]+\/copy$/) && method === 'POST') {
      const srcId = pathname.split('/')[3];
      const src = store.events.find(e => e.id === srcId);
      const parts = body.start_date.split('-');
      const year = Number(parts[0]), month = Number(parts[1]);
      const id = uid('evt');
      const cnt = store.events.filter(e => e.event_code.startsWith(`EVT-${year}-${String(month).padStart(2, '0')}-`)).length + 1;
      const newEv = { ...src, id, event_code: `EVT-${year}-${String(month).padStart(2, '0')}-${String(cnt).padStart(3, '0')}`, name: body.name, start_date: body.start_date, end_date: body.start_date, year, month, status: '筹备中', actual_students: 0, followup_completed: 0 };
      store.events.unshift(newEv);
      store.checklistItems.filter(i => i.event_id === srcId).forEach(i => {
        const chkId = uid('chk');
        store.checklistItems.push({ ...i, id: chkId, event_id: id, status: '未开始', is_checked: 0, completed_date: '', completed_time: '', approval_status: '待提交', rejection_reason: '' });
        store.tasks.push({ id: uid('tsk'), event_id: id, checklist_item_id: chkId, title: i.title, stage: i.stage, assignee_id: newEv.leader_id, due_date: i.due_date, priority: '中', status: '未开始', approval_status: '待提交' });
      });
      saveStore(store);
      return ok({ event: newEv }, 201);
    }
    if (pathname.match(/^\/api\/events\/[^/]+$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      const ev = store.events.find(e => e.id === id);
      if (!ev) return ok({ error: 'Not found' }, 404);
      const hasFin = currentUser.role_id === 'admin' || currentUser.can_view_finance === 1 || (ev.leader_id === currentUser.id && currentUser.role_id === 'leader');
      const hasSens = currentUser.role_id === 'admin' || currentUser.can_view_sensitive_contacts === 1 || ev.leader_id === currentUser.id;
      return ok({
        event: { ...ev, leader_name: usersMap[ev.leader_id]?.name || '未指定' },
        permissions: { can_approve: currentUser.role_id !== 'teacher', can_view_finance: hasFin, can_view_sensitive_contacts: hasSens, can_edit_event: currentUser.role_id !== 'teacher' },
        summary: computeSummary(store, ev),
        checklistItems: store.checklistItems.filter(i => i.event_id === id).map(i => ({ ...i, assignee_name: usersMap[i.assignee_id]?.name || '未分配', completed_by_name: usersMap[i.completed_by]?.name || '', reviewer_name: usersMap[i.reviewer_id]?.name || '' })),
        tasks: store.tasks.filter(t => t.event_id === id).map(t => ({ ...t, assignee_name: usersMap[t.assignee_id]?.name || '未分配' })),
        materials: store.eventMaterials.filter(m => m.event_id === id).map(m => ({ ...m, buyer_name: usersMap[m.buyer_id]?.name || '未分配' })),
        schedules: store.schedules.filter(s => s.event_id === id).map(s => ({ ...s, assignee_name: usersMap[s.assignee_id]?.name || '未分配' })),
        registrations: store.registrations.filter(r => r.event_id === id).map(r => ({ ...r, parent_phone: hasSens ? r.parent_phone : '012-****' })),
        marketingSources: store.marketingSources.filter(m => m.event_id === id).map(m => ({ ...m, assignee_name: usersMap[m.assignee_id]?.name || '未分配' })),
        followUps: store.followUps.filter(f => f.event_id === id),
        budget: hasFin ? (store.budgets.find(b => b.event_id === id) || {}) : null,
        expenses: hasFin ? store.expenses.filter(x => x.event_id === id) : [],
        attachments: store.attachments.filter(a => a.event_id === id),
        review: store.reviews.find(r => r.event_id === id) || null,
        referenceReviews: [],
        executionLogs: store.executionLogs.filter(l => l.event_id === id),
        approvals: store.approvals.filter(a => a.event_id === id)
      });
    }
    if (pathname.match(/^\/api\/events\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      const ev = store.events.find(e => e.id === id);
      if (ev) Object.assign(ev, body);
      saveStore(store);
      return ok({ event: ev });
    }
    if (pathname.match(/^\/api\/events\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      store.events = store.events.filter(e => e.id !== id);
      store.checklistItems = store.checklistItems.filter(i => i.event_id !== id);
      store.tasks = store.tasks.filter(t => t.event_id !== id);
      store.eventMaterials = store.eventMaterials.filter(m => m.event_id !== id);
      store.schedules = store.schedules.filter(s => s.event_id !== id);
      store.registrations = store.registrations.filter(r => r.event_id !== id);
      store.marketingSources = store.marketingSources.filter(m => m.event_id !== id);
      store.followUps = store.followUps.filter(f => f.event_id !== id);
      store.budgets = store.budgets.filter(b => b.event_id !== id);
      store.expenses = store.expenses.filter(x => x.event_id !== id);
      store.attachments = store.attachments.filter(a => a.event_id !== id);
      store.reviews = store.reviews.filter(r => r.event_id !== id);
      saveStore(store);
      return ok({ deleted: true });
    }
    if (pathname === '/api/checklist-items' && method === 'POST') {
      const chkId = uid('chk');
      const item = {
        id: chkId, event_id: body.event_id, stage: body.stage || 'A', sort_order: 99,
        title: body.title, category_tag: body.category_tag || '自定义', assignee_id: body.assignee_id || currentUser.id,
        due_date: body.due_date || '', status: '未开始', is_checked: 0, is_required: body.is_required ? 1 : 0,
        allow_repeat: body.allow_repeat ? 1 : 0, repeat_records: [], notes: body.notes || '', approval_status: '待提交'
      };
      store.checklistItems.push(item);
      store.tasks.push({ id: uid('tsk'), event_id: body.event_id, checklist_item_id: chkId, title: body.title, stage: item.stage, assignee_id: item.assignee_id, due_date: item.due_date, priority: '中', status: '未开始', approval_status: '待提交' });
      saveStore(store);
      return ok({ item }, 201);
    }
    if (pathname.match(/^\/api\/checklist-items\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      store.checklistItems = store.checklistItems.filter(i => i.id !== id);
      store.tasks = store.tasks.filter(t => t.checklist_item_id !== id);
      saveStore(store);
      return ok({ deleted: true });
    }
    if (pathname.match(/^\/api\/event-materials\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      store.eventMaterials = store.eventMaterials.filter(m => m.id !== id);
      saveStore(store);
      return ok({ deleted: true });
    }
    if (pathname === '/api/schedules' && method === 'POST') {
      const s = { id: uid('ros'), sort_order: 99, status: '未开始', is_completed: 0, ...body };
      store.schedules.push(s); saveStore(store); return ok({ schedule: s }, 201);
    }
    if (pathname.match(/^\/api\/schedules\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      store.schedules = store.schedules.filter(s => s.id !== id);
      saveStore(store); return ok({ deleted: true });
    }
    if (pathname === '/api/expenses' && method === 'POST') {
      const ex = { id: uid('exp'), paid_by: currentUser.name, status: '已核销', ...body };
      store.expenses.push(ex); saveStore(store); return ok({ expense: ex }, 201);
    }
    if (pathname === '/api/attachments' && method === 'POST') {
      const att = { id: uid('att'), uploaded_by: currentUser.id, uploaded_by_name: currentUser.name, uploaded_at: new Date().toISOString().slice(0, 10), ...body };
      store.attachments.push(att); saveStore(store); return ok({ attachment: att }, 201);
    }
    if (pathname.match(/^\/api\/attachments\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      store.attachments = store.attachments.filter(a => a.id !== id);
      saveStore(store); return ok({ deleted: true });
    }
    if (pathname.match(/^\/api\/events\/[^/]+\/review$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const idx = store.reviews.findIndex(r => r.event_id === id);
      const rev = { event_id: id, ...body, reviewed_by: currentUser.name, reviewed_at: new Date().toISOString().slice(0, 10) };
      if (idx >= 0) store.reviews[idx] = rev; else store.reviews.push(rev);
      if (body.archive_event) {
        const ev = store.events.find(e => e.id === id);
        if (ev) ev.status = '已归档';
      }
      saveStore(store); return ok({ review: rev });
    }
    if (pathname.match(/^\/api\/checklist-items\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      const item = store.checklistItems.find(i => i.id === id);
      if (item) {
        if (body.is_checked !== undefined) {
          item.is_checked = body.is_checked ? 1 : 0;
          item.status = item.is_checked ? '已完成' : '进行中';
          item.completed_date = item.is_checked ? new Date().toISOString().slice(0, 10) : '';
          item.completed_time = item.is_checked ? new Date().toISOString().slice(11, 19) : '';
          item.completed_by = item.is_checked ? currentUser.id : '';
          item.approval_status = item.is_checked ? '待审核' : '待提交';
        }
        Object.assign(item, body);
        const t = store.tasks.find(x => x.checklist_item_id === id);
        if (t) { t.status = item.status; t.assignee_id = item.assignee_id; t.approval_status = item.approval_status; }
      }
      saveStore(store);
      return ok({ item });
    }
    if (pathname.match(/^\/api\/checklist-items\/[^/]+\/approve$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const item = store.checklistItems.find(i => i.id === id);
      if (item) {
        item.approval_status = body.decision;
        item.rejection_reason = body.reason || '';
        item.reviewer_id = currentUser.id;
        item.reviewed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
        if (body.decision === '退回修改') { item.status = '进行中'; item.is_checked = 0; }
        if (body.decision === '审核通过') { item.status = '已完成'; item.is_checked = 1; }
        const t = store.tasks.find(x => x.checklist_item_id === id);
        if (t) { t.status = item.status; t.approval_status = item.approval_status; t.rejection_reason = item.rejection_reason; }
        store.approvals.unshift({ id: uid('apv'), event_id: item.event_id, reviewer_name: currentUser.name, decision: body.decision, reason: body.reason || '', created_at: item.reviewed_at });
      }
      saveStore(store);
      return ok({ item });
    }
    if (pathname === '/api/tasks' && method === 'GET') {
      const evMap = Object.fromEntries(store.events.map(e => [e.id, e]));
      return ok({ tasks: store.tasks.map(t => ({ ...t, event_name: evMap[t.event_id]?.name || '', assignee_name: usersMap[t.assignee_id]?.name || '未分配' })) });
    }
    if (pathname.match(/^\/api\/tasks\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      const t = store.tasks.find(x => x.id === id);
      if (t) {
        Object.assign(t, body);
        const item = store.checklistItems.find(i => i.id === t.checklist_item_id);
        if (item) { item.status = t.status; item.is_checked = t.status === '已完成' ? 1 : 0; }
      }
      saveStore(store);
      return ok({ task: t });
    }
    if (pathname === '/api/inventory') return ok({ materials: store.materials, transactions: store.inventoryTransactions });
    if (pathname === '/api/event-materials' && method === 'POST') {
      const tot = Number(((body.qty_per_student || 0) * (body.expected_students || 0) + (body.fixed_extra_qty || 0) + (body.safety_buffer_qty || 0)).toFixed(2));
      const buy = Math.max(0, tot - (body.current_stock_available || 0));
      const cost = buy > 0 ? buy * (body.unit_price || 0) + (body.shipping_fee || 0) : 0;
      const req = { id: uid('req'), ...body, total_required_qty: tot, need_purchase_qty: buy, final_actual_cost: cost, procurement_status: '待确认' };
      store.eventMaterials.push(req); saveStore(store); return ok({ materialRequirement: req }, 201);
    }
    if (pathname.match(/^\/api\/event-materials\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      const m = store.eventMaterials.find(x => x.id === id);
      if (m) Object.assign(m, body);
      saveStore(store); return ok({ materialRequirement: m });
    }
    if (pathname === '/api/registrations' && method === 'POST') {
      const r = { id: uid('reg'), ...body, status: '已报名', balance_rm: Math.max(0, (body.payable_rm || 0) - (body.paid_rm || 0)) };
      store.registrations.push(r); saveStore(store); return ok({ registration: r }, 201);
    }
    if (pathname.match(/^\/api\/registrations\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      const r = store.registrations.find(x => x.id === id);
      if (r) { Object.assign(r, body); r.balance_rm = Math.max(0, (r.payable_rm || 0) - (r.paid_rm || 0)); }
      saveStore(store); return ok({ registration: r });
    }
    if (pathname.match(/^\/api\/schedules\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      const s = store.schedules.find(x => x.id === id);
      if (s) Object.assign(s, body);
      saveStore(store); return ok({ schedule: s });
    }
    if (pathname === '/api/analytics') {
      return ok({
        insufficient_data: false,
        catStats: [{ category: '假期活动', event_count: 1, total_expected: 100, total_registered: 42 }, { category: '科学实验活动', event_count: 1, total_expected: 60, total_registered: 64 }],
        channelStats: store.marketingSources.slice(0, 4).map(s => ({ source_name: s.source_name, total_db: s.database_count, total_contacted: s.contacted_count, total_registered: s.registered_count, total_attended: s.attended_count, total_success: s.success_count, conversion_rate: s.conversion_rate })),
        delayedTasks: [],
        repeatMaterials: store.eventMaterials.map(m => ({ name: m.name, unit: m.unit, event_count: 1, total_req: m.total_required_qty, total_spent: m.final_actual_cost })),
        auditLogs: store.auditLogs
      });
    }
    if (pathname === '/api/system/backup') return ok({ exported_at: new Date().toISOString(), data: store });
    return ok({ ok: true });
  };
})();
