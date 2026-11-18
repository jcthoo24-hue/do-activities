const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, '5plus1_sop.sqlite');
const db = new DatabaseSync(dbPath);

// Enable WAL and foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      permissions TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role_id TEXT NOT NULL,
      branch TEXT DEFAULT '总院 Main Branch',
      phone TEXT,
      email TEXT,
      avatar_color TEXT DEFAULT '#C8102E',
      can_view_finance INTEGER DEFAULT 0,
      can_view_sensitive_contacts INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      default_schedules_json TEXT DEFAULT '[]',
      default_materials_json TEXT DEFAULT '[]',
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS checklist_templates (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      stage TEXT NOT NULL, -- 'A' | 'B' | 'C'
      sort_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      category_tag TEXT DEFAULT 'SOP核心',
      days_offset INTEGER DEFAULT 0,
      is_required INTEGER DEFAULT 1,
      allow_repeat INTEGER DEFAULT 0,
      default_repeats_json TEXT DEFAULT '[]',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      event_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      theme TEXT DEFAULT '',
      category TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      start_time TEXT DEFAULT '13:00',
      end_time TEXT DEFAULT '16:00',
      location TEXT DEFAULT '总院礼堂',
      branch TEXT DEFAULT '总院 Main Branch',
      target_grades TEXT DEFAULT '[]', -- JSON array
      age_range TEXT DEFAULT '7-12岁',
      leader_id TEXT NOT NULL,
      assistant_ids TEXT DEFAULT '[]', -- JSON array
      expected_students INTEGER DEFAULT 50,
      min_students INTEGER DEFAULT 20,
      actual_students INTEGER DEFAULT 0,
      fee_rm REAL DEFAULT 0,
      budget_rm REAL DEFAULT 500,
      purpose TEXT DEFAULT '',
      goals TEXT DEFAULT '',
      description TEXT DEFAULT '',
      precautions TEXT DEFAULT '',
      poster_url TEXT DEFAULT '',
      internal_notes TEXT DEFAULT '',
      status TEXT DEFAULT '筹备中', -- 草稿 / 筹备中 / 宣传中 / 开放报名 / 准备就绪 / 举办中 / 已结束 / 已归档 / 已取消
      followup_completed INTEGER DEFAULT 0,
      readiness_override_reason TEXT DEFAULT '',
      readiness_override_by TEXT DEFAULT '',
      readiness_override_at TEXT DEFAULT '',
      template_id TEXT DEFAULT '',
      copied_from_event_id TEXT DEFAULT '',
      level1_name TEXT DEFAULT 'Level 1 基础招生目标',
      level1_definition TEXT DEFAULT '非本院实际出席人数目标',
      level1_target INTEGER DEFAULT 25,
      level2_name TEXT DEFAULT 'Level 2 冲刺转化目标',
      level2_definition TEXT DEFAULT '非本院成功报读常规班目标',
      level2_target INTEGER DEFAULT 10,
      success_metric_type TEXT DEFAULT 'converted', -- 'registered' | 'attended' | 'converted'
      milestone_nodes_json TEXT DEFAULT '{}',
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_checklist_items (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      stage TEXT NOT NULL, -- 'A' | 'B' | 'C'
      sort_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      category_tag TEXT DEFAULT 'SOP核心',
      assignee_id TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      days_offset INTEGER DEFAULT 0,
      completed_date TEXT DEFAULT '',
      completed_time TEXT DEFAULT '',
      completed_by TEXT DEFAULT '',
      status TEXT DEFAULT '未开始', -- 未开始 / 进行中 / 待审核 / 已完成 / 不适用
      is_checked INTEGER DEFAULT 0,
      is_required INTEGER DEFAULT 1,
      allow_repeat INTEGER DEFAULT 0,
      repeat_records_json TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      actual_situation TEXT DEFAULT '',
      need_re_followup INTEGER DEFAULT 0,
      parent_feedback TEXT DEFAULT '',
      next_followup_date TEXT DEFAULT '',
      contact_status TEXT DEFAULT '', -- 已联络 / 未回复 / 需再次联络
      followup_result TEXT DEFAULT '',
      whatsapp_notes TEXT DEFAULT '',
      is_sensitive_student_record INTEGER DEFAULT 0,
      evidence_url TEXT DEFAULT '',
      evidence_name TEXT DEFAULT '',
      approval_status TEXT DEFAULT '待提交', -- 待提交 / 待审核 / 审核通过 / 退回修改 / 需要补充资料
      reviewer_id TEXT DEFAULT '',
      reviewed_at TEXT DEFAULT '',
      rejection_reason TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS checklist_execution_logs (
      id TEXT PRIMARY KEY,
      checklist_item_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_status TEXT DEFAULT '',
      new_status TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      checklist_item_id TEXT DEFAULT '',
      task_id TEXT DEFAULT '',
      submitted_by TEXT DEFAULT '',
      reviewer_id TEXT NOT NULL,
      reviewer_name TEXT NOT NULL,
      decision TEXT NOT NULL, -- 审核通过 / 退回修改 / 需要补充资料 / 重新分配负责人
      reason TEXT DEFAULT '',
      reassigned_to TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      checklist_item_id TEXT DEFAULT '', -- Linked 1:1 if from Ticklist
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      stage TEXT DEFAULT 'A',
      assignee_id TEXT DEFAULT '',
      assistant_ids TEXT DEFAULT '[]',
      start_date TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      priority TEXT DEFAULT '中', -- 高 / 中 / 低
      status TEXT DEFAULT '未开始', -- 未开始 / 进行中 / 待审核 / 已完成 / 不适用
      approval_status TEXT DEFAULT '待提交',
      rejection_reason TEXT DEFAULT '',
      attachment_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_acknowledged INTEGER DEFAULT 0,
      completed_at TEXT DEFAULT '',
      completed_by TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_person TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      platform TEXT DEFAULT 'Shopee / 淘宝 / 实体店',
      link TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT '手工美术',
      unit TEXT DEFAULT '个', -- 个 / 包 / 张 / 卷 / 套 / 瓶
      total_stock REAL DEFAULT 0,
      reserved_stock REAL DEFAULT 0,
      default_unit_price REAL DEFAULT 0,
      supplier_id TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_material_requirements (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      material_id TEXT DEFAULT '',
      name TEXT NOT NULL,
      purpose TEXT DEFAULT '',
      buyer_id TEXT DEFAULT '',
      category TEXT DEFAULT '手工美术',
      unit TEXT DEFAULT '个',
      qty_per_student REAL DEFAULT 1,
      fixed_extra_qty REAL DEFAULT 0,
      expected_students INTEGER DEFAULT 50,
      safety_buffer_qty REAL DEFAULT 0,
      total_required_qty REAL DEFAULT 50,
      current_stock_available REAL DEFAULT 0,
      need_purchase_qty REAL DEFAULT 50,
      reserved_from_stock REAL DEFAULT 0,
      pricing_plan TEXT DEFAULT 'actual', -- 'original' | 'air' | 'sea' | 'actual'
      unit_price REAL DEFAULT 0,
      original_price REAL DEFAULT 0,
      air_freight_price REAL DEFAULT 0,
      sea_freight_price REAL DEFAULT 0,
      shipping_fee REAL DEFAULT 0,
      final_actual_cost REAL DEFAULT 0,
      supplier_name TEXT DEFAULT '',
      purchase_link TEXT DEFAULT '',
      expected_arrival_date TEXT DEFAULT '',
      actual_arrival_date TEXT DEFAULT '',
      actual_arrived_qty REAL DEFAULT 0,
      procurement_status TEXT DEFAULT '待确认',
      step_confirmed INTEGER DEFAULT 0,
      step_stock_checked INTEGER DEFAULT 0,
      step_decided_buy INTEGER DEFAULT 0,
      step_ordered INTEGER DEFAULT 0,
      step_paid INTEGER DEFAULT 0,
      step_arrived INTEGER DEFAULT 0,
      step_counted INTEGER DEFAULT 0,
      step_allocated INTEGER DEFAULT 0,
      step_ready INTEGER DEFAULT 0,
      is_critical INTEGER DEFAULT 1,
      photo_url TEXT DEFAULT '',
      receipt_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      requirement_id TEXT NOT NULL,
      buyer_id TEXT DEFAULT '',
      supplier_name TEXT DEFAULT '',
      quantity REAL DEFAULT 0,
      total_amount_rm REAL DEFAULT 0,
      payment_status TEXT DEFAULT '未付款',
      order_date TEXT DEFAULT '',
      arrival_date TEXT DEFAULT '',
      receipt_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL,
      event_id TEXT DEFAULT '',
      tx_type TEXT NOT NULL, -- '入库' | '预留' | '领用' | '归还' | '损耗' | '库存调整'
      quantity REAL NOT NULL,
      before_stock REAL DEFAULT 0,
      after_stock REAL DEFAULT 0,
      operator_id TEXT DEFAULT '',
      operator_name TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_schedules (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      title TEXT NOT NULL,
      assignee_id TEXT DEFAULT '',
      materials_needed TEXT DEFAULT '',
      venue TEXT DEFAULT '主活动室',
      instructions TEXT DEFAULT '',
      precautions TEXT DEFAULT '',
      status TEXT DEFAULT '未开始', -- 未开始 / 进行中 / 已完成
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      grade TEXT DEFAULT '三年级',
      branch TEXT DEFAULT '总院 Main Branch',
      student_type TEXT DEFAULT '本院生', -- '本院生' | '非本院生'
      parent_name TEXT DEFAULT '',
      parent_phone TEXT DEFAULT '',
      registration_date TEXT DEFAULT '',
      source TEXT DEFAULT '本院家长Group',
      status TEXT DEFAULT '已报名', -- '已报名' | '候补名单' | '已取消'
      payment_method TEXT DEFAULT 'TNG', -- 'Cash' | 'TNG' | '其他'
      payable_rm REAL DEFAULT 0,
      paid_rm REAL DEFAULT 0,
      balance_rm REAL DEFAULT 0,
      receipt_no TEXT DEFAULT '',
      receipt_url TEXT DEFAULT '',
      attended INTEGER DEFAULT 0,
      converted_to_course INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      registration_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      amount_rm REAL NOT NULL,
      payment_method TEXT DEFAULT 'TNG',
      receipt_no TEXT DEFAULT '',
      received_by TEXT DEFAULT '',
      paid_at TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS marketing_sources (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 1,
      database_count INTEGER DEFAULT 0,
      contacted_count INTEGER DEFAULT 0,
      responded_count INTEGER DEFAULT 0,
      registered_count INTEGER DEFAULT 0,
      attended_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      conversion_rate REAL DEFAULT 0,
      assignee_id TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS marketing_actions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      source_id TEXT DEFAULT '',
      channel TEXT NOT NULL,
      action_date TEXT NOT NULL,
      assignee_id TEXT DEFAULT '',
      reach_count INTEGER DEFAULT 0,
      result_notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      registration_id TEXT DEFAULT '',
      student_name TEXT NOT NULL,
      student_type TEXT DEFAULT '非本院生',
      parent_phone TEXT DEFAULT '',
      assignee_id TEXT DEFAULT '',
      step_number INTEGER DEFAULT 1, -- 1 to 7
      days_after_event INTEGER DEFAULT 1,
      due_date TEXT DEFAULT '',
      contact_status TEXT DEFAULT '未联络', -- '已联络' | '未回复' | '需再次联络' | '未联络'
      parent_feedback TEXT DEFAULT '',
      next_followup_date TEXT DEFAULT '',
      followup_result TEXT DEFAULT '跟进中', -- '跟进中' | '已预约体验课' | '已成功报读' | '暂不考虑'
      whatsapp_notes TEXT DEFAULT '',
      steps_completed_json TEXT DEFAULT '[false,false,false,false,false,false,false]',
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      event_id TEXT UNIQUE NOT NULL,
      expected_income_rm REAL DEFAULT 0,
      actual_income_rm REAL DEFAULT 0,
      material_budget_rm REAL DEFAULT 0,
      actual_material_cost_rm REAL DEFAULT 0,
      transport_budget_rm REAL DEFAULT 0,
      actual_transport_rm REAL DEFAULT 0,
      venue_budget_rm REAL DEFAULT 0,
      actual_venue_rm REAL DEFAULT 0,
      catering_budget_rm REAL DEFAULT 0,
      actual_catering_rm REAL DEFAULT 0,
      prize_budget_rm REAL DEFAULT 0,
      actual_prize_rm REAL DEFAULT 0,
      marketing_budget_rm REAL DEFAULT 0,
      actual_marketing_rm REAL DEFAULT 0,
      other_budget_rm REAL DEFAULT 0,
      actual_other_rm REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      category TEXT NOT NULL, -- '材料费用' | '运输费用' | '场地费用' | '餐饮费用' | '奖品费用' | '宣传费用' | '其他开支'
      title TEXT NOT NULL,
      amount_rm REAL NOT NULL,
      paid_by TEXT DEFAULT '',
      expense_date TEXT DEFAULT '',
      receipt_url TEXT DEFAULT '',
      receipt_name TEXT DEFAULT '',
      status TEXT DEFAULT '已核销',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      category TEXT NOT NULL, -- '活动海报' | '宣传视频' | '活动照片' | '材料照片' | '收据' | 'Excel表格' | 'PDF' | 'Word' | 'PPT' | 'Google Drive链接' | '购买链接' | '其他附件'
      original_name TEXT NOT NULL,
      file_type TEXT DEFAULT 'file',
      file_url TEXT NOT NULL,
      file_size TEXT DEFAULT '',
      uploaded_by TEXT NOT NULL,
      uploaded_by_name TEXT NOT NULL,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS event_reviews (
      id TEXT PRIMARY KEY,
      event_id TEXT UNIQUE NOT NULL,
      what_went_well TEXT DEFAULT '',
      problems_encountered TEXT DEFAULT '',
      materials_shortage TEXT DEFAULT '',
      materials_excess TEXT DEFAULT '',
      effective_channels TEXT DEFAULT '',
      unsmooth_arrangements TEXT DEFAULT '',
      parent_feedback_summary TEXT DEFAULT '',
      student_feedback_summary TEXT DEFAULT '',
      improvements_next_time TEXT DEFAULT '',
      score_prep_efficiency INTEGER DEFAULT 0,
      score_teacher_execution INTEGER DEFAULT 0,
      score_student_participation INTEGER DEFAULT 0,
      score_parent_feedback INTEGER DEFAULT 0,
      score_material_prep INTEGER DEFAULT 0,
      score_budget_control INTEGER DEFAULT 0,
      score_overall_effect INTEGER DEFAULT 0,
      custom_scores_json TEXT DEFAULT '[]',
      save_as_reference INTEGER DEFAULT 1,
      reviewed_by TEXT DEFAULT '',
      reviewed_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '',
      user_name TEXT DEFAULT '',
      role_id TEXT DEFAULT '',
      event_id TEXT DEFAULT '',
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = {
  db,
  dbPath,
  initSchema
};
