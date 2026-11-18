const { db } = require('./db');
const crypto = require('node:crypto');

function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

// Original Counter SOP Items as specified in Section 4
const STAGE_A_DEFAULT = [
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

const STAGE_B_DEFAULT = [
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
  // Extended On-site Preparation Sub-items
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

const STAGE_C_DEFAULT = [
  { sort: 1, title: 'Step 1：感谢参加活动、说明活动意义、鼓励转发朋友、邀友福利。', offset: 1, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
  { sort: 2, title: 'Step 2：了解 IG、兴趣爱好及学校表现。', offset: 2, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
  { sort: 3, title: 'Step 3：Sharing 教材，例如 Lesson Plan / Busy Bag / Test，针对科目 T-UP。', offset: 3, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
  { sort: 4, title: 'Step 4：了解学习情况，邀请一起复习或学习。', offset: 4, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
  { sort: 5, title: 'Step 5：询问本院课程上课时间，鼓励一起来。', offset: 5, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
  { sort: 6, title: 'Step 6：科目时间、现场安排、温馨提醒。', offset: 6, req: 1, repeat: 0, tag: 'Close跟进7步骤' },
  { sort: 7, title: 'Step 7：Post Group 报告。', offset: 7, req: 1, repeat: 0, tag: 'Close跟进7步骤' }
];

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function seedDatabase() {
  const roleCount = db.prepare('SELECT COUNT(*) as cnt FROM roles').get().cnt;
  if (roleCount > 0) return;

  // 1. Seed Roles
  const insertRole = db.prepare('INSERT INTO roles (id, name, description, permissions) VALUES (?, ?, ?, ?)');
  insertRole.run('admin', 'Admin／院长', '具有全部权限，管理活动、审核Ticklist、查看财务、管理老师与SOP模板', JSON.stringify(['all']));
  insertRole.run('leader', '活动负责人', '管理被指派的活动、分配任务、审核本活动进度、管理材料流程与复盘', JSON.stringify(['manage_assigned_events', 'approve_ticklist', 'manage_materials', 'manage_tasks']));
  insertRole.run('teacher', '老师', '查看参与的活动、勾选完成分配任务、上传照片、更新备注、查看负责材料', JSON.stringify(['view_assigned_events', 'execute_tasks', 'upload_evidence']));

  // 2. Seed Users
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password, name, role_id, branch, phone, email, avatar_color, can_view_finance, can_view_sensitive_contacts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('u-admin', 'admin', '5plus1', '总院管理员 (Admin)', 'admin', '总院 Main Branch', '012-3456789', 'principal@5plus1.edu.my', '#C8102E', 1, 1);
  insertUser.run('u-leader1', 'lin', '5plus1', '林主管 (Ms. Lim)', 'leader', '总院 Main Branch', '016-8889900', 'lim@5plus1.edu.my', '#1D4ED8', 1, 1);
  insertUser.run('u-leader2', 'wong', '5plus1', '黄主任 (Mr. Wong)', 'leader', 'Setia Alam 分行', '017-2233445', 'wong@5plus1.edu.my', '#047857', 0, 1);
  insertUser.run('u-teacher1', 'hu', '5plus1', '胡老师 (Teacher Hu)', 'teacher', '总院 Main Branch', '018-3344556', 'hu@5plus1.edu.my', '#7C3AED', 0, 0);
  insertUser.run('u-teacher2', 'zhang', '5plus1', '张老师 (Teacher Chong)', 'teacher', '总院 Main Branch', '019-4455667', 'chong@5plus1.edu.my', '#D97706', 0, 0);
  insertUser.run('u-teacher3', 'lee', '5plus1', '李老师 (Teacher Lee)', 'teacher', 'Mount Austin 分行', '011-5566778', 'lee@5plus1.edu.my', '#0E7490', 0, 0);

  // 3. Seed Templates
  const defaultSchedules = [
    { start_time: '13:00', end_time: '13:15', title: '学生签到 & 派发非本院名字牌', venue: '接待大堂', materials_needed: '签到表、名字牌、贴纸', instructions: '热情接待，非本院生佩戴特别颜色名牌并引导拍照' },
    { start_time: '13:15', end_time: '13:30', title: '活动破冰开场 & 讲师介绍', venue: '主礼堂', materials_needed: '麦克风、PPT、音响', instructions: '带动现场气氛，介绍5+1特色与今日闯关规则' },
    { start_time: '13:30', end_time: '14:00', title: '第一关：主题探索与互动挑战', venue: '活动室 A', materials_needed: '第一关任务卡、主材料包', instructions: '分组协助，认识非本院学生并记录表现' },
    { start_time: '14:00', end_time: '14:30', title: '第二关：动手实作／实验挑战', venue: '科学手工区', materials_needed: '核心实验/手工材料、安全护具', instructions: '指导学生完成作品，老师抓拍精彩特写照片发给家长' },
    { start_time: '14:30', end_time: '15:00', title: '第三关：团队比拼 & 成果展示', venue: '主礼堂', materials_needed: '展示台、计分板', instructions: '邀请学生上台分享，提升自信与曝光度' },
    { start_time: '15:00', end_time: '15:30', title: '颁奖典礼 & 派发体验课 Voucher', venue: '主礼堂', materials_needed: '奖状、用心小礼物、免费体验课时间表&Voucher', instructions: '颁发小礼物，针对非本院家长做现场 Close 动作' },
    { start_time: '15:30', end_time: '16:00', title: '大合照／接送散场 & 意见表收集', venue: '接待大堂', materials_needed: '宣传横幅、家长意见表二维码', instructions: '全体大合照即时 Send 本院/非本院，确保学生安全接送' }
  ];

  const insertTemplate = db.prepare(`
    INSERT INTO event_templates (id, name, code, category, description, default_schedules_json, default_materials_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const templates = [
    { id: 'tpl-counter-sop', name: '使用原版 Counter SOP', code: 'COUNTER_SOP', category: '通用标准SOP', desc: '完整包含5+1原版纸本Counter SOP：阶段A（18项事前推广）、阶段B（10项现场核心+10项现场准备）、阶段C（Close跟进7步骤）' },
    { id: 'tpl-holiday', name: '使用假期活动模板', code: 'HOLIDAY_SOP', category: '假期活动', desc: '适用于学校假期营、科学手作营、主题闯关日（含原版SOP及材料密集准备清单）' },
    { id: 'tpl-outing', name: '使用出游活动模板', code: 'OUTING_SOP', category: '学生出游', desc: '适用于户外考察、科学馆参访、巴士出游（含巴士预订、家长同意书、保险与点名核对）' },
    { id: 'tpl-festival', name: '使用节庆活动模板', code: 'FESTIVAL_SOP', category: '节庆活动', desc: '适用于新春、中秋、万圣节、圣诞派对活动（含节庆布置、礼物交换与招生转化SOP）' },
    { id: 'tpl-competition', name: '使用比赛活动模板', code: 'COMPETITION_SOP', category: '学生比赛', desc: '适用于数学竞赛、演讲比赛、拼字比赛（含考场布置、评委评分表、奖杯奖状核对）' },
    { id: 'tpl-blank', name: '空白模板', code: 'BLANK_SOP', category: '其他自定义活动', desc: '保留A/B/C三阶段结构框架，可自由新增自定义检查项' },
    { id: 'tpl-custom', name: '自定义模板（科学实验专版）', code: 'CUSTOM_SCI_SOP', category: '科学实验活动', desc: '5+1热门科学实验专版SOP，强化实验器材安全测试与课堂转化跟进' }
  ];

  const insertChecklistTpl = db.prepare(`
    INSERT INTO checklist_templates (id, template_id, stage, sort_order, title, category_tag, days_offset, is_required, allow_repeat, default_repeats_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const t of templates) {
    insertTemplate.run(t.id, t.name, t.code, t.category, t.desc, JSON.stringify(defaultSchedules), '[]', 'u-admin');
    if (t.id !== 'tpl-blank') {
      STAGE_A_DEFAULT.forEach(item => {
        const defaultRepeats = item.repeat ? [
          { round: '第一次执行', date: '', assignee: '', result: '', completed: false },
          { round: '第二次执行', date: '', assignee: '', result: '', completed: false },
          { round: '第三次执行', date: '', assignee: '', result: '', completed: false }
        ] : [];
        insertChecklistTpl.run(uid('ct'), t.id, 'A', item.sort, item.title, item.tag, item.offset, item.req, item.repeat, JSON.stringify(defaultRepeats));
      });
      STAGE_B_DEFAULT.forEach(item => {
        insertChecklistTpl.run(uid('ct'), t.id, 'B', item.sort, item.title, item.tag, item.offset, item.req, item.repeat, '[]');
      });
      STAGE_C_DEFAULT.forEach(item => {
        insertChecklistTpl.run(uid('ct'), t.id, 'C', item.sort, item.title, item.tag, item.offset, item.req, item.repeat, '[]');
      });
    }
  }

  // 4. Seed Shared Materials Inventory (including Forest Kingdom Mask items!)
  const insertMat = db.prepare(`
    INSERT INTO materials (id, name, category, unit, total_stock, reserved_stock, default_unit_price, supplier_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertMat.run('mat-mask', '空白立体动物面具胚', '手工美术', '个', 35, 15, 2.50, 'Shopee 美术批发部', '森林王国神秘面具活动主材料');
  insertMat.run('mat-leaf', '仿真森林树叶包（混色）', '手工美术', '包', 20, 5, 4.80, '淘宝森系手作店', '每包约50片，供学生装饰面具');
  insertMat.run('mat-tape', '强力泡棉双面胶', '文具耗材', '卷', 40, 10, 1.80, 'Popular 大众书局', '共用耗材，固定装饰物');
  insertMat.run('mat-deco', '森林宝石与羽毛装饰包', '手工美术', '套', 25, 0, 3.20, '淘宝森系手作店', '亮片、羽毛、彩珠组合');
  insertMat.run('mat-paper', 'A4加厚彩色卡纸', '文具耗材', '张', 60, 0, 0.35, 'Popular 大众书局', '宣传单与手工折纸通用');
  insertMat.run('mat-badge', '非本院生专属挂绳名牌套', '行政宣传', '个', 120, 40, 0.90, '本地印刷厂', '活动当天非本院生识别必用');
  insertMat.run('mat-gift', '5+1定制文具用心小礼物', '礼品奖品', '套', 80, 30, 3.50, '5+1总部仓库', '出席学生伴手礼');

  // 5. Seed Sample Events:
  // Event 1: 「森林王国神秘面具」假期工坊 (2026年11月 - 筹备中/宣传中, 100人预计，展示完整Ticklist与材料精算)
  // Event 2: 「小小科学家：火山与晶洞实验日」 (2026年10月 - 已结束，供历史档案、复盘与转化分析展示)
  createFullSampleEvent({
    id: 'evt-forest-mask',
    event_code: 'EVT-2026-11-001',
    name: '森林王国神秘面具手作营',
    theme: '探索自然美学 · 激发创意潜能',
    category: '假期活动',
    year: 2026,
    month: 11,
    start_date: '2026-11-28',
    end_date: '2026-11-28',
    start_time: '13:00',
    end_time: '16:00',
    location: '总院 2楼创意礼堂',
    branch: '总院 Main Branch',
    target_grades: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
    age_range: '7-12岁',
    leader_id: 'u-leader1',
    assistant_ids: ['u-teacher1', 'u-teacher2'],
    expected_students: 100,
    min_students: 40,
    actual_students: 42,
    fee_rm: 35,
    budget_rm: 1800,
    purpose: '通过森林主题手工面具创作吸引周边非本院生走进5+1中心，体验生动课堂氛围并转化为2027新学年常规班学生。',
    goals: '总出席100人（其中非本院生至少35人），活动后7天内成功转化至少12名非本院生报读全科/单科补习班。',
    description: '结合自然科普与立体美术创作，每位学生亲手制作专属森林神秘面具，并进行森林舞台走秀与颁奖。',
    precautions: '注意热熔胶枪安全使用；非本院生签到时必须准确核对家长WhatsApp并派发专属颜色名字牌。',
    status: '宣传中',
    template_id: 'tpl-counter-sop',
    is_past: false
  });

  createFullSampleEvent({
    id: 'evt-science-oct',
    event_code: 'EVT-2026-10-001',
    name: '小小科学家：奇幻火山与晶洞实验日',
    theme: '趣味STEM科学实验 · 点燃好奇心',
    category: '科学实验活动',
    year: 2026,
    month: 10,
    start_date: '2026-10-18',
    end_date: '2026-10-18',
    start_time: '14:00',
    end_time: '17:00',
    location: '总院 STEM 实验室',
    branch: '总院 Main Branch',
    target_grades: ['三年级', '四年级', '五年级', '六年级'],
    age_range: '9-12岁',
    leader_id: 'u-leader1',
    assistant_ids: ['u-teacher1', 'u-teacher3'],
    expected_students: 60,
    min_students: 30,
    actual_students: 64,
    fee_rm: 40,
    budget_rm: 1200,
    purpose: '展示5+1科学实验教学实力，提升四至六年级科学科新生报读率。',
    goals: '招收60名学生，非本院生占25人以上，转化10名新生。',
    description: '学生亲手操作酸碱火山爆发模拟与饱和溶液结晶实验，附赠5+1独家科学实验手册与免费体验课Voucher。',
    precautions: '所有学生必须佩戴护目镜；小苏打与柠檬酸按组定量派发。',
    status: '已结束',
    template_id: 'tpl-counter-sop',
    is_past: true
  });
}

function createFullSampleEvent(ev) {
  const milestoneNodes = {
    promo_start: addDays(ev.start_date, -30),
    check_reg_procure: addDays(ev.start_date, -14),
    check_arrival_flow: addDays(ev.start_date, -7),
    final_check: addDays(ev.start_date, -1),
    event_day: ev.start_date,
    followup_review: addDays(ev.start_date, 7)
  };

  db.prepare(`
    INSERT INTO events (
      id, event_code, name, theme, category, year, month, start_date, end_date, start_time, end_time,
      location, branch, target_grades, age_range, leader_id, assistant_ids,
      expected_students, min_students, actual_students, fee_rm, budget_rm,
      purpose, goals, description, precautions, status, followup_completed,
      template_id, level1_name, level1_definition, level1_target, level2_name, level2_definition, level2_target,
      milestone_nodes_json, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ev.id, ev.event_code, ev.name, ev.theme, ev.category, ev.year, ev.month, ev.start_date, ev.end_date, ev.start_time, ev.end_time,
    ev.location, ev.branch, JSON.stringify(ev.target_grades), ev.age_range, ev.leader_id, JSON.stringify(ev.assistant_ids),
    ev.expected_students, ev.min_students, ev.actual_students, ev.fee_rm, ev.budget_rm,
    ev.purpose, ev.goals, ev.description, ev.precautions, ev.status, ev.is_past ? 1 : 0,
    ev.template_id, 'Level 1 非本院出席目标', '非本院生实际到场参加人数', 30, 'Level 2 课程转化目标', '活动后报读常规补习班人数', 12,
    JSON.stringify(milestoneNodes), 'u-admin'
  );

  // Insert Checklist Items & Synchronized Tasks
  const insertItem = db.prepare(`
    INSERT INTO event_checklist_items (
      id, event_id, stage, sort_order, title, category_tag, assignee_id, due_date, days_offset,
      completed_date, completed_time, completed_by, status, is_checked, is_required, allow_repeat,
      repeat_records_json, notes, approval_status, reviewer_id, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, event_id, checklist_item_id, title, content, stage, assignee_id, assistant_ids,
      start_date, due_date, priority, status, approval_status, notes, is_acknowledged, completed_at, completed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const teachers = ['u-leader1', 'u-teacher1', 'u-teacher2'];
  const allStages = [
    ...STAGE_A_DEFAULT.map(x => ({ ...x, stage: 'A' })),
    ...STAGE_B_DEFAULT.map(x => ({ ...x, stage: 'B' })),
    ...STAGE_C_DEFAULT.map(x => ({ ...x, stage: 'C' }))
  ];

  allStages.forEach((item, idx) => {
    const itemId = uid('chk');
    const assignee = teachers[idx % teachers.length];
    const dueDate = addDays(ev.start_date, item.offset);

    let isChecked = 0;
    let status = '未开始';
    let completedDate = '';
    let completedTime = '';
    let completedBy = '';
    let approvalStatus = '待提交';
    let reviewerId = '';
    let reviewedAt = '';
    let notes = '';

    if (ev.is_past) {
      isChecked = 1;
      status = '已完成';
      completedDate = dueDate;
      completedTime = '15:30:00';
      completedBy = assignee;
      approvalStatus = '审核通过';
      reviewerId = 'u-admin';
      reviewedAt = dueDate + ' 18:00:00';
      notes = '已按SOP标准执行完毕并归档。';
    } else if (item.stage === 'A' && item.sort <= 6) {
      isChecked = 1;
      status = '已完成';
      completedDate = '2026-11-10';
      completedTime = '14:20:00';
      completedBy = assignee;
      approvalStatus = item.sort <= 4 ? '审核通过' : '待审核';
      reviewerId = item.sort <= 4 ? 'u-admin' : '';
      reviewedAt = item.sort <= 4 ? '2026-11-11 10:00:00' : '';
      notes = '已完成首轮设计与群发推广，家长反应热烈。';
    } else if (item.stage === 'A' && item.sort <= 10) {
      status = '进行中';
      notes = '正在分批拨打名单跟进中。';
    }

    const repeatRecords = item.repeat ? [
      {
        round: '第一次发布/执行',
        date: addDays(ev.start_date, -25),
        assignee: '胡老师 (Teacher Hu)',
        result: isChecked ? '已发送本院8个年级群及FB主页，触达320位家长' : '计划活动前25天执行',
        completed: !!isChecked
      },
      {
        round: '第二次发布/执行',
        date: addDays(ev.start_date, -14),
        assignee: '张老师 (Teacher Chong)',
        result: ev.is_past ? '二次晒出样品照片与名额倒数，新增18人报名' : '计划活动前14天执行',
        completed: !!ev.is_past
      },
      {
        round: '第三次发布/执行',
        date: addDays(ev.start_date, -5),
        assignee: '林主管 (Ms. Lim)',
        result: ev.is_past ? '最后冲刺提醒，名额满额' : '计划活动前5天最后冲刺',
        completed: !!ev.is_past
      }
    ] : [];

    insertItem.run(
      itemId, ev.id, item.stage, item.sort, item.title, item.tag, assignee, dueDate, item.offset,
      completedDate, completedTime, completedBy, status, isChecked, item.req, item.repeat,
      JSON.stringify(repeatRecords), notes, approvalStatus, reviewerId, reviewedAt
    );

    const priority = item.req ? (item.stage === 'A' && item.sort <= 10 ? '高' : '中') : '低';
    insertTask.run(
      uid('tsk'), ev.id, itemId, item.title, `[${ev.name}] 阶段${item.stage} SOP任务：${item.title}`,
      item.stage, assignee, JSON.stringify([]), addDays(dueDate, -3), dueDate,
      priority, status, approvalStatus, notes, isChecked ? 1 : 0,
      isChecked ? `${completedDate} ${completedTime}` : '', completedBy
    );
  });

  // Materials for Forest Kingdom Mask Event (exact specification from Section 7!)
  if (ev.id === 'evt-forest-mask') {
    const insertReq = db.prepare(`
      INSERT INTO event_material_requirements (
        id, event_id, material_id, name, purpose, buyer_id, category, unit,
        qty_per_student, fixed_extra_qty, expected_students, safety_buffer_qty,
        total_required_qty, current_stock_available, need_purchase_qty, reserved_from_stock,
        pricing_plan, unit_price, original_price, air_freight_price, sea_freight_price, shipping_fee, final_actual_cost,
        supplier_name, purchase_link, expected_arrival_date, actual_arrival_date,
        procurement_status, step_confirmed, step_stock_checked, step_decided_buy, step_ordered, step_paid,
        step_arrived, step_counted, step_allocated, step_ready, is_critical, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. 面具: 1 per student * 100 + 0 fixed + 10 buffer = 110 required. Available stock = 20. Need buy = 90.
    insertReq.run(
      uid('req'), ev.id, 'mat-mask', '森林动物立体面具胚', '每位学生主手作基底', 'u-teacher1', '手工美术', '个',
      1, 0, 100, 10, 110, 20, 90, 20,
      'actual', 2.20, 2.80, 2.50, 1.90, 18.00, 90 * 2.20 + 18.00,
      'Shopee 美术批发部', 'https://shopee.com.my/forest-mask-blank', '2026-11-22', '2026-11-21',
      '已到货', 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, '已点算数量无误，质量良好'
    );
    // 2. 叶子: 0.2 pack per student * 100 + 2 fixed + 3 buffer = 25 packs. Available = 15. Need buy = 10.
    insertReq.run(
      uid('req'), ev.id, 'mat-leaf', '仿真森林树叶包（混色50片装）', '面具自然风装饰与舞台布置', 'u-teacher1', '手工美术', '包',
      0.2, 2, 100, 3, 25, 15, 10, 15,
      'air', 4.50, 5.50, 4.50, 3.60, 12.00, 10 * 4.50 + 12.00,
      '淘宝森系手作店', 'https://taobao.com/forest-leaves', '2026-11-24', '',
      '已下单', 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, '空运专线运输中，预计24日到中心'
    );
    // 3. 双面胶: 0.2 roll per student * 100 + 5 fixed + 5 buffer = 30 rolls. Available = 30. Need buy = 0.
    insertReq.run(
      uid('req'), ev.id, 'mat-tape', '强力泡棉双面胶', '分组粘贴立体配件', 'u-teacher2', '文具耗材', '卷',
      0.2, 5, 100, 5, 30, 30, 0, 30,
      'actual', 1.80, 1.80, 1.80, 1.50, 0, 0,
      'Popular 大众书局', 'https://popularonline.com.my', '2026-11-15', '2026-11-15',
      '已准备完成', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, '中心总库存充足，已直接预留30卷'
    );
    // 4. 装饰用品: 1 set per student * 100 + 0 fixed + 8 buffer = 108 sets. Available = 25. Need buy = 83.
    insertReq.run(
      uid('req'), ev.id, 'mat-deco', '森林宝石与彩色羽毛装饰包', '面具点缀与发光装饰', 'u-teacher2', '手工美术', '套',
      1, 0, 100, 8, 108, 25, 83, 25,
      'actual', 3.00, 3.80, 3.20, 2.60, 15.00, 83 * 3.00 + 15.00,
      '淘宝森系手作店', 'https://taobao.com/feather-gems', '2026-11-23', '2026-11-22',
      '已点算数量', 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, '羽毛颜色鲜艳，已按10人一组分装'
    );
  }

  // Schedules (Run of Show)
  const insertSched = db.prepare(`
    INSERT INTO event_schedules (
      id, event_id, sort_order, start_time, end_time, title, assignee_id,
      materials_needed, venue, instructions, precautions, status, is_completed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rosItems = [
    { s: '13:00', e: '13:15', t: '学生签到 & 派发名牌', a: 'u-teacher2', m: '签到表、非本院生专属名牌、贴纸', v: '1楼接待处', i: '核对报名名单与付款状态，非本院生贴金星标识', p: '注意引导家长扫码进福利群' },
    { s: '13:15', e: '13:30', t: '活动开场 & 森林王国故事导入', a: 'u-leader1', m: '开场PPT、背景音乐、无线麦', v: '2楼创意礼堂', i: '破冰互动，宣布三大闯关任务与集章奖励规则', p: '确保后排学生听清规则' },
    { s: '13:30', e: '14:00', t: '第一关：森林寻宝与色彩构思', a: 'u-teacher1', m: '森林图鉴卡、空白立体面具胚、彩笔', v: '创意礼堂A区', i: '引导学生构思动物角色并完成面具底色涂装', p: '提醒学生穿戴防污围裙' },
    { s: '14:00', e: '14:30', t: '第二关：神秘面具立体装饰实作', a: 'u-teacher1', m: '仿真树叶包、强力泡棉双面胶、宝石羽毛装饰包', v: '创意礼堂B区', i: '指导学生组合树叶与羽毛，老师走动拍照并认识非本院学生', p: '剪刀使用注意安全' },
    { s: '14:30', e: '15:00', t: '第三关：森林王国舞台走秀大比拼', a: 'u-leader1', m: '舞台灯光、号码牌、投票贴纸', v: '礼堂主舞台', i: '每组学生戴面具上台展示并作30秒自我介绍，录制短视频', p: '鼓励内向学生开口表达' },
    { s: '15:00', e: '15:30', t: '颁奖典礼 & 免费体验课Voucher派发', a: 'u-leader1', m: '最佳创意奖状、用心小礼物、免费体验课时间表&Voucher', v: '礼堂主舞台', i: '颁发全员结业礼与优胜奖，同步向到场家长介绍5+1体验课福利', p: '重点锁定非本院生家长预约体验时间' },
    { s: '15:30', e: '16:00', t: '全体大合照／家长接送散场', a: 'u-teacher2', m: '活动手持KT板、家长意见表二维码', v: '礼堂及接待处', i: '拍大合照并即时Send本院/非本院家长，完成意见表填写', p: '严格核对家长接送离场' }
  ];
  rosItems.forEach((r, i) => {
    insertSched.run(
      uid('ros'), ev.id, i + 1, r.s, r.e, r.t, r.a, r.m, r.v, r.i, r.p,
      ev.is_past ? '已完成' : '未开始', ev.is_past ? 1 : 0
    );
  });

  // Registrations & Payments
  const insertReg = db.prepare(`
    INSERT INTO registrations (
      id, event_id, student_name, grade, branch, student_type, parent_name, parent_phone,
      registration_date, source, status, payment_method, payable_rm, paid_rm, balance_rm,
      receipt_no, attended, converted_to_course, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPay = db.prepare(`
    INSERT INTO payments (id, registration_id, event_id, student_name, amount_rm, payment_method, receipt_no, received_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sampleStudents = [
    { name: '林子轩 (Jayden Lim)', grade: '三年级', type: '本院生', pName: 'Mrs. Lim', phone: '012-3019988', src: '本院家长Group', status: '已报名', method: 'TNG', paid: ev.fee_rm, att: 1, conv: 0, note: '喜欢恐龙与绿色树叶装饰' },
    { name: '陈语彤 (Chloe Tan)', grade: '四年级', type: '非本院生', pName: 'Mr. Tan', phone: '016-7788231', src: 'Send Phonebank', status: '已报名', method: 'TNG', paid: ev.fee_rm, att: 1, conv: 1, note: '对5+1英文与科学实验班很有兴趣' },
    { name: '黄凯泽 (Lucas Wong)', grade: '二年级', type: '非本院生', pName: 'Mdm. Wong', phone: '017-5544321', src: '本院兄弟姐妹', status: '已报名', method: 'Cash', paid: ev.fee_rm, att: 1, conv: 1, note: '哥哥在5+1就读六年级，妈妈想了解二年级华文班' },
    { name: '张芷晴 (Hannah Chong)', grade: '五年级', type: '非本院生', pName: 'Mrs. Chong', phone: '018-9900112', src: 'Send 停补生', status: '已报名', method: 'TNG', paid: ev.fee_rm, paidPartial: false, att: 1, conv: 0, note: '曾经读过假期班，希望安排下周三体验课' },
    { name: '李浩然 (Ethan Lee)', grade: '一年级', type: '非本院生', pName: 'Mr. Lee', phone: '019-2233889', src: '小老板', status: '已报名', method: 'Cash', paid: 0, att: 0, conv: 0, note: '已留位，活动当天到场付现金（未付款不计入实收）' },
    { name: '吴宇航 (Ryan Goh)', grade: '三年级', type: '本院生', pName: 'Mrs. Goh', phone: '012-6677881', src: '本院家长Group', status: '已报名', method: 'TNG', paid: ev.fee_rm, att: 1, conv: 0, note: '已收款并发电子收据' }
  ];

  sampleStudents.forEach((st, idx) => {
    const regId = uid('reg');
    const balance = Math.max(0, ev.fee_rm - st.paid);
    const receiptNo = st.paid > 0 ? `RCP-${ev.year}${ev.month}-${1001 + idx}` : '';
    insertReg.run(
      regId, ev.id, st.name, st.grade, ev.branch, st.type, st.pName, st.phone,
      addDays(ev.start_date, -15 + idx), st.src, st.status, st.method,
      ev.fee_rm, st.paid, balance, receiptNo,
      ev.is_past ? st.att : (idx < 3 ? 1 : 0),
      st.conv, st.note
    );
    if (st.paid > 0) {
      insertPay.run(uid('pay'), regId, ev.id, st.name, st.paid, st.method, receiptNo, '林主管 (Ms. Lim)', '报名费收讫');
    }

    // Create FollowUp record for non-center students
    if (st.type === '非本院生') {
      db.prepare(`
        INSERT INTO follow_ups (
          id, event_id, registration_id, student_name, student_type, parent_phone,
          assignee_id, step_number, days_after_event, due_date, contact_status,
          parent_feedback, next_followup_date, followup_result, whatsapp_notes,
          steps_completed_json, is_completed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('flw'), ev.id, regId, st.name, st.type, st.phone,
        idx % 2 === 0 ? 'u-teacher1' : 'u-leader1',
        ev.is_past ? 7 : 3, 3, addDays(ev.start_date, 3),
        ev.is_past ? '已联络' : '已联络',
        '家长非常认可活动现场气氛，孩子回家一直展示作品。',
        addDays(ev.start_date, 5),
        st.conv ? '已成功报读' : '已预约体验课',
        'WhatsApp已发送活动高清特写照、Busy Bag教材预览及下周四免费体验课Voucher。',
        JSON.stringify(ev.is_past ? [true, true, true, true, true, true, true] : [true, true, true, false, false, false, false]),
        ev.is_past ? 1 : 0
      );
    }
  });

  // Marketing Sources (Section 10: 4 default Counter SOP sources)
  const insertSource = db.prepare(`
    INSERT INTO marketing_sources (
      id, event_id, source_name, sort_order, database_count, contacted_count,
      responded_count, registered_count, attended_count, success_count, conversion_rate, assignee_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const defaultSources = [
    { name: 'Send Phonebank', db: 150, c: 120, r: 45, reg: 14, att: 12, suc: 5, a: 'u-teacher1', n: '主攻中心周边3公里小学名单' },
    { name: 'Send 停补生', db: 65, c: 60, r: 28, reg: 9, att: 8, suc: 4, a: 'u-leader1', n: '邀请旧生回娘家参加主题活动' },
    { name: '本院兄弟姐妹', db: 80, c: 75, r: 40, reg: 11, att: 10, suc: 5, a: 'u-teacher2', n: '通过现有在读生弟弟妹妹邀约，转化率最高' },
    { name: '小老板', db: 90, c: 70, r: 30, reg: 8, att: 7, suc: 2, a: 'u-teacher1', n: '派发小老板邀友优惠券带动同学报名' }
  ];
  defaultSources.forEach((s, i) => {
    const rate = s.reg > 0 ? Number(((s.suc / s.reg) * 100).toFixed(1)) : 0;
    insertSource.run(uid('src'), ev.id, s.name, i + 1, s.db, s.c, s.r, s.reg, s.att, s.suc, rate, s.a, s.n);
  });

  // Budgets & Expenses (Section 11)
  const paidIncome = sampleStudents.reduce((acc, s) => acc + s.paid, 0);
  const matCost = ev.id === 'evt-forest-mask' ? (216 + 57 + 264) : 480;
  db.prepare(`
    INSERT INTO budgets (
      id, event_id, expected_income_rm, actual_income_rm,
      material_budget_rm, actual_material_cost_rm,
      transport_budget_rm, actual_transport_rm,
      venue_budget_rm, actual_venue_rm,
      catering_budget_rm, actual_catering_rm,
      prize_budget_rm, actual_prize_rm,
      marketing_budget_rm, actual_marketing_rm,
      other_budget_rm, actual_other_rm, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uid('bdg'), ev.id, ev.expected_students * ev.fee_rm, paidIncome,
    650, matCost,
    100, 45,
    200, 150,
    300, 220,
    300, 260,
    150, 120,
    100, 40,
    '所有开支凭收据实报实销，未付款报名费严格不计入实际已收收入。'
  );

  const insertExp = db.prepare(`
    INSERT INTO expenses (id, event_id, category, title, amount_rm, paid_by, expense_date, receipt_name, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertExp.run(uid('exp'), ev.id, '材料费用', '面具胚、仿真树叶与装饰宝石首批采购', matCost, '胡老师 (Teacher Hu)', addDays(ev.start_date, -10), 'Shopee_Invoice_01.pdf', '已核销', '含跨境空运运费');
  insertExp.run(uid('exp'), ev.id, '宣传费用', '宣传海报与小老板邀友券彩色印刷', 120, '林主管 (Ms. Lim)', addDays(ev.start_date, -20), 'PrintShop_Receipt.jpg', '已核销', '共印制500份');
  insertExp.run(uid('exp'), ev.id, '奖品费用', '用心小礼物与最佳创意奖品采购', 260, '张老师 (Teacher Chong)', addDays(ev.start_date, -8), 'Gift_Receipt.pdf', '已核销', '100份伴手礼');
  insertExp.run(uid('exp'), ev.id, '餐饮费用', '活动当天学生茶点与饮用水', 220, '林主管 (Ms. Lim)', addDays(ev.start_date, -2), 'Bakery_Receipt.jpg', '已核销', '独立包装小蛋糕');

  // Attachments (Section 14)
  const insertAtt = db.prepare(`
    INSERT INTO attachments (id, event_id, category, original_name, file_type, file_url, file_size, uploaded_by, uploaded_by_name, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAtt.run(uid('att'), ev.id, '活动海报', `${ev.name}_主视觉海报_A3.png`, 'image', '/assets/sample-poster.svg', '1.8 MB', 'u-teacher1', '胡老师 (Teacher Hu)', '已审核通过用于FB与家长群转发');
  insertAtt.run(uid('att'), ev.id, '宣传视频', `${ev.name}_30秒班上推广短片.mp4`, 'video', 'https://drive.google.com/file/d/5plus1-promo-video', '14.2 MB', 'u-teacher1', '胡老师 (Teacher Hu)', '供老师在班上播放及Show实物');
  insertAtt.run(uid('att'), ev.id, 'Google Drive链接', '5+1活动高清照片与家长反馈云端相册', 'link', 'https://drive.google.com/drive/folders/5plus1-event-album', '-', 'u-leader1', '林主管 (Ms. Lim)', '活动当天实时上传');
  insertAtt.run(uid('att'), ev.id, '收据', 'Shopee_手工材料采购总收据.pdf', 'pdf', '/assets/sample-receipt.svg', '420 KB', 'u-teacher1', '胡老师 (Teacher Hu)', '财务核销凭证');

  // Review (Section 13)
  if (ev.is_past) {
    db.prepare(`
      INSERT INTO event_reviews (
        id, event_id, what_went_well, problems_encountered, materials_shortage, materials_excess,
        effective_channels, unsmooth_arrangements, parent_feedback_summary, student_feedback_summary,
        improvements_next_time, score_prep_efficiency, score_teacher_execution, score_student_participation,
        score_parent_feedback, score_material_prep, score_budget_control, score_overall_effect,
        save_as_reference, reviewed_by, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid('rev'), ev.id,
      '班上Show实物与本院兄弟姐妹转介绍效果极佳；活动当天拍照即时Send给家长获得高度好评。',
      '签到高峰期集中在13:55-14:05，非本院生填写资料略微拥挤。',
      '柠檬酸补充包差点不够，幸好动用了10份安全备用量。',
      '彩色吸管多买了3包，已归还中心总库存供下次使用。',
      '「本院兄弟姐妹」与「班上推广Video/Show实物」报名转化率最高（超过42%）。',
      '第二关到第三关换场时洗手间排队时间较长。',
      '家长普遍反映孩子回家后主动分享科学原理，对5+1老师的专业度与耐心非常满意。',
      '最喜欢火山爆发互动环节与领取小礼物环节。',
      '下次签到处分设「本院生快速通道」与「非本院生VIP接待桌」，由专人一对一派发名牌与体验课Voucher。',
      5, 5, 5, 5, 4, 5, 5, 1, '总院管理员 (Admin)', '2026-10-22 16:00:00'
    );
  }
}

module.exports = {
  seedDatabase,
  STAGE_A_DEFAULT,
  STAGE_B_DEFAULT,
  STAGE_C_DEFAULT,
  addDays,
  uid
};
