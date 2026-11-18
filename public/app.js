/**
 * 5+1 Education Group - 活动管理与执行系统 (Event Management & SOP System)
 * Full-Featured Frontend Controller (Part 1: Core State, API, Dashboard, Create Event, and Event First Page Ticklist)
 */
const App = {
  state: {
    currentUser: null,
    users: [],
    roles: [],
    templates: [],
    events: [],
    currentView: 'dashboard',
    currentEventId: null,
    currentEventData: null,
    eventSubTab: 'ticklist', // MUST default to 'ticklist' when opening any event!
    expandedTickItems: {},
    tickFilterStage: 'ALL',
    tickFilterAssignee: 'ALL',
    tickFilterStatus: 'ALL',
    tickOnlyUnfinished: false,
    calendarViewMode: 'month', // 'month' | 'week' | 'list' | 'year'
    calendarYear: 2026,
    calendarMonth: 11,
    taskViewMode: 'list', // 'list' | 'kanban' | 'calendar' | 'by-teacher' | 'by-event'
    taskFilterAssignee: 'ALL',
    taskFilterEvent: 'ALL',
    taskFilterStatus: 'ALL',
    archiveFilters: {
      year: '',
      month: '',
      search: '',
      category: '',
      leader_id: '',
      status: '',
      branch: '',
      grade: ''
    },
    liveRosMode: false
  },

  async init() {
    const savedUserId = localStorage.getItem('5plus1_user_id') || 'u-admin';
    this.state.currentUserId = savedUserId;
    await this.loadInitialData();
    this.renderUserSelector();
    this.navigate('dashboard');
  },

  async api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-User-Id': this.state.currentUser?.id || this.state.currentUserId || 'u-admin',
      ...(options.headers || {})
    };
    try {
      const res = await fetch(path, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `请求失败 (${res.status})`);
      }
      return data;
    } catch (err) {
      this.toast(err.message || '网络或服务器错误，请检查连接后重试', 'error');
      throw err;
    }
  },

  toast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast-msg ${type}`;
    el.innerHTML = `<span>${type === 'error' ? '⚠️' : '✓'}</span><span>${this.esc(msg)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3500);
  },

  esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  statusBadge(status, dueDate = '', isChecked = 0) {
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = !isChecked && status !== '已完成' && status !== '不适用' && dueDate && dueDate < today;
    if (isOverdue) {
      return `<span class="status-pill status-overdue">● 逾期 (${this.esc(status)})</span>`;
    }
    if (status === '已完成' || isChecked) {
      return `<span class="status-pill status-completed">✓ 已完成</span>`;
    }
    if (status === '待审核') {
      return `<span class="status-pill status-review">⏳ 待审核</span>`;
    }
    if (status === '进行中') {
      return `<span class="status-pill status-progress">▶ 进行中</span>`;
    }
    if (status === '不适用') {
      return `<span class="status-pill status-pending">— 不适用</span>`;
    }
    return `<span class="status-pill status-pending">○ ${this.esc(status || '待处理')}</span>`;
  },

  approvalBadge(appStatus) {
    if (appStatus === '审核通过') return `<span class="status-pill status-completed">✓ 主管已审核通过</span>`;
    if (appStatus === '待审核') return `<span class="status-pill status-review">⏳ 待主管审核</span>`;
    if (appStatus === '退回修改') return `<span class="status-pill status-overdue">↩ 退回修改</span>`;
    if (appStatus === '需要补充资料') return `<span class="status-pill status-overdue">📎 需补充资料</span>`;
    return `<span class="status-pill status-pending">未提审</span>`;
  },

  async loadInitialData() {
    const [uData, tData, eData, taskData] = await Promise.all([
      this.api('/api/users'),
      this.api('/api/templates'),
      this.api('/api/events'),
      this.api('/api/tasks')
    ]);
    this.state.users = uData.users || [];
    this.state.roles = uData.roles || [];
    this.state.currentUser = uData.currentUser;
    this.state.templates = tData.templates || [];
    this.state.events = eData.events || [];
    this.state.allTasks = taskData.tasks || [];
    this.updateTaskBadge();
  },

  updateTaskBadge() {
    const badge = document.getElementById('nav-task-badge');
    if (!badge || !this.state.currentUser) return;
    const myPending = (this.state.allTasks || []).filter(
      t => t.assignee_id === this.state.currentUser.id && t.status !== '已完成' && t.status !== '不适用'
    ).length;
    if (myPending > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = myPending;
    } else {
      badge.style.display = 'none';
    }
  },

  renderUserSelector() {
    const sel = document.getElementById('current-user-select');
    if (!sel) return;
    const roleMap = { admin: 'Admin/院长', leader: '活动负责人', teacher: '老师' };
    sel.innerHTML = this.state.users.map(u => `
      <option value="${u.id}" ${u.id === this.state.currentUser?.id ? 'selected' : ''}>
        ${this.esc(u.name)} [${roleMap[u.role_id] || u.role_id}]
      </option>
    `).join('');
  },

  async switchUser(userId) {
    this.state.currentUserId = userId;
    localStorage.setItem('5plus1_user_id', userId);
    await this.loadInitialData();
    this.renderUserSelector();
    this.toast(`已切换身份为：${this.state.currentUser.name}`);
    if (this.state.currentView === 'event-detail' && this.state.currentEventId) {
      await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
    } else {
      this.navigate(this.state.currentView);
    }
  },

  toggleMobileMenu() {
    const sb = document.getElementById('app-sidebar');
    if (sb) sb.classList.toggle('open');
  },

  closeModal() {
    const root = document.getElementById('app-modal-root');
    if (root) {
      root.style.display = 'none';
      root.innerHTML = '';
    }
  },

  async navigate(view, params = {}) {
    const sb = document.getElementById('app-sidebar');
    if (sb) sb.classList.remove('open');

    this.state.currentView = view;
    document.querySelectorAll('#main-nav .nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === view);
    });

    const titles = {
      'dashboard': '1. 活动总览 Dashboard',
      'my-events': '2. 我的活动',
      'calendar': '3. 活动日历 Calendar',
      'my-tasks': '4. 我的任务 & 老师任务安排',
      'materials': '5. 材料采购与中心总库存',
      'finance': '6. 费用与活动预算管理',
      'registrations': '7. 报名与学生参与记录',
      'archives': '8. 历史活动档案 & 复制中心',
      'analytics': '9. 智能分析与统计报告',
      'templates': '10. SOP模板管理',
      'users': '11. 老师与权限管理',
      'settings': '12. 系统设置与数据备份'
    };
    const bc = document.getElementById('breadcrumb-bar');
    if (bc && titles[view]) bc.innerHTML = titles[view];

    await this.loadInitialData();

    if (view === 'dashboard') return this.renderDashboard(false);
    if (view === 'my-events') return this.renderDashboard(true);
    if (view === 'calendar') return this.renderCalendarView();
    if (view === 'my-tasks') return this.renderTasksView();
    if (view === 'materials') return this.renderGlobalMaterialsView();
    if (view === 'finance') return this.renderGlobalFinanceView();
    if (view === 'registrations') return this.renderGlobalRegistrationsView();
    if (view === 'archives') return this.renderArchivesView();
    if (view === 'analytics') return this.renderAnalyticsView();
    if (view === 'templates') return this.renderTemplatesView();
    if (view === 'users') return this.renderUsersView();
    if (view === 'settings') return this.renderSettingsView();
  },

  /**
   * CRITICAL REQUIREMENT (Section 2 & Section 4):
   * When clicking ANY event, the FIRST PAGE displayed MUST be the "活动执行总 Ticklist"!
   */
  async openEvent(eventId, subTab = 'ticklist') {
    this.state.currentView = 'event-detail';
    this.state.currentEventId = eventId;
    this.state.eventSubTab = subTab || 'ticklist';
    const data = await this.api(`/api/events/${eventId}`);
    this.state.currentEventData = data;

    const bc = document.getElementById('breadcrumb-bar');
    if (bc) {
      bc.innerHTML = `
        <span style="cursor:pointer; color:var(--text-secondary);" onclick="App.navigate('dashboard')">活动总览</span>
        <span style="margin:0 6px; color:var(--text-muted);">/</span>
        <span style="color:var(--brand-red);">${this.esc(data.event.name)} (${this.esc(data.event.event_code)})</span>
      `;
    }
    this.renderEventWorkspace();
  },

  // ============================================================================
  // 1 & 2. DASHBOARD & MY EVENTS
  // ============================================================================
  async renderDashboard(onlyMine = false) {
    const main = document.getElementById('app-main-view');
    let events = this.state.events;
    if (onlyMine) {
      const res = await this.api('/api/events?mine=1');
      events = res.events || [];
    }

    const totalEvents = events.length;
    const activeEvents = events.filter(e => !['已结束', '已归档', '已取消'].includes(e.status)).length;
    const totalOverdue = events.reduce((s, e) => s + (e.summary?.overdueItems || 0), 0);
    const totalPendingReview = events.reduce((s, e) => s + (e.summary?.pendingApprovalItems || 0), 0);

    // Teacher personal task reminder strip
    const today = new Date().toISOString().slice(0, 10);
    const next7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const myTasks = (this.state.allTasks || []).filter(t => t.assignee_id === this.state.currentUser?.id);
    const myTodayTasks = myTasks.filter(t => t.status !== '已完成' && t.due_date === today);
    const myOverdueTasks = myTasks.filter(t => t.status !== '已完成' && t.due_date && t.due_date < today);

    main.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">活动总数</div>
          <div class="kpi-value">${totalEvents}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">筹备／进行中</div>
          <div class="kpi-value" style="color:var(--brand-red);">${activeEvents}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">待主管审核</div>
          <div class="kpi-value" style="color:#B45309;">${totalPendingReview}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">逾期未完成项</div>
          <div class="kpi-value" style="color:#B91C1C;">${totalOverdue}</div>
        </div>
      </div>

      ${(myOverdueTasks.length > 0 || myTodayTasks.length > 0) ? `
        <div class="alert-box alert-warning">
          <div>🔔 <strong>我的待办提醒：</strong> 您有 ${myOverdueTasks.length} 项逾期任务、${myTodayTasks.length} 项今日到期任务。</div>
          <button class="btn btn-sm btn-secondary" onclick="App.navigate('my-tasks')">处理我的任务</button>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-header">
          <div class="card-title">📌 活动列表（点击任意活动直接进入 Ticklist）</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-sm ${!onlyMine ? 'btn-primary' : 'btn-secondary'}" onclick="App.renderDashboard(false)">全部活动</button>
            <button class="btn btn-sm ${onlyMine ? 'btn-primary' : 'btn-secondary'}" onclick="App.renderDashboard(true)">只看我的活动</button>
            <button class="btn btn-primary btn-sm" onclick="App.openCreateEventModal()">＋ 新建活动</button>
          </div>
        </div>

        ${events.length === 0 ? `<p style="padding:20px; color:var(--text-muted);">暂无活动记录，请点击右上角「＋ 新建活动」。</p>` : `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(350px, 1fr)); gap:16px;">
            ${events.map(ev => {
              const s = ev.summary || {};
              return `
                <div class="card" style="margin-bottom:0; border-top:4px solid ${ev.status === '已结束' || ev.status === '已归档' ? '#16A34A' : 'var(--brand-red)'}; display:flex; flex-direction:column; justify-content:space-between;">
                  <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
                      <span style="font-size:12px; font-weight:700; color:var(--brand-red); background:var(--brand-red-light); padding:2px 8px; border-radius:4px;">${this.esc(ev.event_code)} · ${this.esc(ev.category)}</span>
                      <span class="status-pill ${ev.status === '已结束' || ev.status === '已归档' ? 'status-completed' : 'status-progress'}">${this.esc(ev.status)}</span>
                    </div>

                    <h3 style="font-size:18px; font-weight:800; margin-bottom:8px; cursor:pointer; color:var(--text-primary);" onclick="App.openEvent('${ev.id}', 'ticklist')">
                      ${this.esc(ev.name)}
                    </h3>

                    <div style="font-size:13px; color:var(--text-secondary); margin-bottom:12px; display:flex; flex-direction:column; gap:3px;">
                      <div>📅 ${this.esc(ev.start_date)} ｜ 📍 ${this.esc(ev.location)}</div>
                      <div>👤 负责人：<strong>${this.esc(ev.leader_name)}</strong> ｜ 🎓 已报名：<strong>${s.activeRegistrations || 0} / ${ev.expected_students}人</strong></div>
                    </div>

                    <div style="margin-bottom:12px;">
                      <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:700; margin-bottom:4px;">
                        <span>Ticklist 进度 (${s.completedItems}/${s.totalItems})</span>
                        <span style="color:var(--brand-red);">${s.completionPct}%</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill" style="width:${s.completionPct}%;"></div>
                      </div>
                    </div>
                  </div>

                  <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:1px solid var(--border-color); gap:6px;">
                    <button class="btn btn-primary btn-sm" style="flex:1;" onclick="App.openEvent('${ev.id}', 'ticklist')">
                      📋 打开 Ticklist
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="App.openCopyEventModal('${ev.id}')" title="复制活动">📑 复制</button>
                    <button class="btn btn-danger btn-sm" onclick="App.openDeleteEventModal('${ev.id}', '${this.esc(ev.name)}')" title="删除活动">🗑️</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  },

  openDeleteEventModal(eventId, eventName) {
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:440px;">
          <h3 style="font-size:18px; font-weight:800; color:#B91C1C; margin-bottom:10px;">🗑️ 确认删除活动？</h3>
          <p style="font-size:14px; color:var(--text-secondary); margin-bottom:16px;">
            您确定要永久删除活动 <strong>「${this.esc(eventName)}」</strong> 吗？<br/>
            删除后，该活动的 Ticklist、任务、材料和报名记录将一并移除且无法恢复。
          </p>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-danger" onclick="App.confirmDeleteEvent('${eventId}')">确认永久删除</button>
          </div>
        </div>
      </div>
    `;
  },

  async confirmDeleteEvent(eventId) {
    await this.api(`/api/events/${eventId}`, { method: 'DELETE' });
    this.closeModal();
    this.toast('活动已永久删除');
    this.state.currentEventId = null;
    this.state.currentEventData = null;
    await this.navigate('dashboard');
  },

  // ============================================================================
  // 3. EVENT WORKSPACE & FIRST PAGE COMPLETE TICKLIST (SECTION 4 & 5)
  // ============================================================================
  renderEventWorkspace() {
    const main = document.getElementById('app-main-view');
    const d = this.state.currentEventData;
    if (!d || !d.event) return;
    const ev = d.event;
    const s = d.summary;
    const subTab = this.state.eventSubTab || 'ticklist';

    const teacherPendingMap = {};
    (d.checklistItems || []).forEach(item => {
      if (!item.is_checked && item.status !== '已完成' && item.status !== '不适用') {
        const name = item.assignee_name || '未分配';
        teacherPendingMap[name] = (teacherPendingMap[name] || 0) + 1;
      }
    });
    const teacherPendingText = Object.entries(teacherPendingMap)
      .map(([name, cnt]) => `${name} (${cnt}项)`)
      .join('、') || '全部已完成';

    main.innerHTML = `
      <div class="event-hero-banner">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
              <span style="background:var(--brand-red); color:#fff; font-weight:800; font-size:12.5px; padding:2px 9px; border-radius:6px;">${this.esc(ev.event_code)}</span>
              <span class="status-pill status-progress">${this.esc(ev.status)}</span>
              <span style="font-size:13px; color:var(--text-secondary);">📅 ${this.esc(ev.start_date)} ${this.esc(ev.start_time)}-${this.esc(ev.end_time)} ｜ 📍 ${this.esc(ev.location)} ｜ 👤 ${this.esc(ev.leader_name)}</span>
            </div>
            <h1 style="font-size:23px; font-weight:900; color:var(--text-primary);">${this.esc(ev.name)}</h1>
          </div>

          <div class="no-print" style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="App.openEditEventModal()">✏️ 编辑</button>
            <button class="btn btn-secondary btn-sm" onclick="App.openCopyEventModal('${ev.id}')">📑 复制</button>
            <button class="btn btn-primary btn-sm" onclick="App.openPrintCenterModal()">🖨️ 打印 / 导出</button>
            <button class="btn btn-danger btn-sm" onclick="App.openDeleteEventModal('${ev.id}', '${this.esc(ev.name)}')">🗑️ 删除活动</button>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; font-size:13.5px; background:var(--bg-subtle); padding:10px 14px; border-radius:8px; margin-bottom:12px;">
          <div>🎯 <strong>目标：</strong>${this.esc(ev.goals || ev.expected_students + '人')}</div>
          <div>👩‍🏫 <strong>待完成老师：</strong><span style="color:${Object.keys(teacherPendingMap).length ? '#B91C1C' : '#15803D'}; font-weight:700;">${this.esc(teacherPendingText)}</span></div>
          <div>📦 <strong>材料：</strong>${s.unreadyCriticalMaterialsCount === 0 ? '<span style="color:#15803D; font-weight:700;">✓ 齐备</span>' : `<span style="color:#B91C1C; font-weight:700;">${s.unreadyCriticalMaterialsCount}项未齐</span>`}</div>
          <div>🚀 <strong>开办状态：</strong>${s.criticalUnfinishedCount === 0 ? '<span style="color:#15803D; font-weight:800;">✓ 可正式开始</span>' : `<span style="color:#B91C1C; font-weight:800;">仍有${s.criticalUnfinishedCount}项关键未完</span> ${!ev.readiness_override_reason ? `<button class="btn btn-sm btn-warning no-print" style="padding:1px 7px; font-size:11px; margin-left:4px;" onclick="App.openReadinessOverrideModal()">特批推进</button>` : ''}`}</div>
        </div>

        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-bottom:6px; font-size:13.5px; font-weight:700;">
          <span>总项目：${s.totalItems}</span>
          <span style="color:#15803D;">✓ 已完成：${s.completedItems}</span>
          <span>○ 未完成：${s.uncompletedItems}</span>
          ${s.overdueItems > 0 ? `<span style="color:#B91C1C;">● 逾期：${s.overdueItems}</span>` : ''}
          ${s.pendingApprovalItems > 0 ? `<span style="color:#B45309;">⏳ 待审核：${s.pendingApprovalItems}</span>` : ''}
          <span style="margin-left:auto; color:var(--brand-red); font-size:16px;">完成度 ${s.completionPct}%</span>
        </div>

        <div class="progress-track">
          <div class="progress-fill" style="width:${s.completionPct}%;"></div>
        </div>
      </div>

      <div class="event-subnav no-print">
        <button class="subnav-tab ${subTab === 'ticklist' ? 'active' : ''}" onclick="App.switchEventTab('ticklist')">
          ☑️ 1. 活动执行总 Ticklist (第一页核心)
        </button>
        <button class="subnav-tab ${subTab === 'tasks' ? 'active' : ''}" onclick="App.switchEventTab('tasks')">
          👩‍🏫 2. 老师任务分配 (${d.tasks.length})
        </button>
        <button class="subnav-tab ${subTab === 'materials' ? 'active' : ''}" onclick="App.switchEventTab('materials')">
          📦 3. 材料清单与采购精算 (${d.materials.length})
        </button>
        <button class="subnav-tab ${subTab === 'schedule' ? 'active' : ''}" onclick="App.switchEventTab('schedule')">
          ⏱️ 4. 活动流程表 Run of Show (${d.schedules.length})
        </button>
        <button class="subnav-tab ${subTab === 'registrations' ? 'active' : ''}" onclick="App.switchEventTab('registrations')">
          🎓 5. 报名与签到 (${d.registrations.length})
        </button>
        <button class="subnav-tab ${subTab === 'marketing' ? 'active' : ''}" onclick="App.switchEventTab('marketing')">
          📣 6. 非本院来源与跟进7步骤
        </button>
        <button class="subnav-tab ${subTab === 'finance' ? 'active' : ''}" onclick="App.switchEventTab('finance')">
          💰 7. 活动预算与财务
        </button>
        <button class="subnav-tab ${subTab === 'review' ? 'active' : ''}" onclick="App.switchEventTab('review')">
          📝 8. 总结与复盘报告
        </button>
        <button class="subnav-tab ${subTab === 'files' ? 'active' : ''}" onclick="App.switchEventTab('files')">
          📂 9. 文件与素材中心 (${d.attachments.length})
        </button>
        <button class="subnav-tab ${subTab === 'logs' ? 'active' : ''}" onclick="App.switchEventTab('logs')">
          🛡️ 10. 审核与操作历史
        </button>
      </div>

      <div id="event-subtab-container"></div>
    `;

    this.renderEventSubTabContent();
  },

  switchEventTab(tabName) {
    this.state.eventSubTab = tabName;
    this.renderEventWorkspace();
  },

  renderEventSubTabContent() {
    const tab = this.state.eventSubTab;
    if (tab === 'ticklist') return this.renderEventTicklistTab();
    if (tab === 'tasks') return this.renderEventTasksTab();
    if (tab === 'materials') return this.renderEventMaterialsTab();
    if (tab === 'schedule') return this.renderEventScheduleTab();
    if (tab === 'registrations') return this.renderEventRegistrationsTab();
    if (tab === 'marketing') return this.renderEventMarketingTab();
    if (tab === 'finance') return this.renderEventFinanceTab();
    if (tab === 'review') return this.renderEventReviewTab();
    if (tab === 'files') return this.renderEventFilesTab();
    if (tab === 'logs') return this.renderEventLogsTab();
  },

  // ============================================================================
  // PAGE 1 CORE: 3-STAGE SOP TICKLIST (STAGE A, STAGE B, STAGE C)
  // ============================================================================
  renderEventTicklistTab() {
    const container = document.getElementById('event-subtab-container');
    const d = this.state.currentEventData;
    const ev = d.event;
    const canApprove = d.permissions.can_approve;
    let items = d.checklistItems || [];

    // Filter controls
    if (this.state.tickFilterStage !== 'ALL') {
      items = items.filter(i => i.stage === this.state.tickFilterStage);
    }
    if (this.state.tickFilterAssignee !== 'ALL') {
      items = items.filter(i => i.assignee_id === this.state.tickFilterAssignee);
    }
    if (this.state.tickFilterStatus !== 'ALL') {
      items = items.filter(i => i.status === this.state.tickFilterStatus);
    }
    if (this.state.tickOnlyUnfinished) {
      items = items.filter(i => !i.is_checked && i.status !== '已完成' && i.status !== '不适用');
    }

    const stages = [
      { code: 'A', name: '阶段 A：活动前一个月／事前推广', desc: '包含原版纸本 Counter SOP 全部18项宣传推广动作，支持多次重复发布记录与截止节点管理' },
      { code: 'B', name: '阶段 B：活动当天／现场执行', desc: '包含原版 Counter SOP 10项现场转化核心动作 ＋ 10项现场准备扩展子项目' },
      { code: 'C', name: '阶段 C：活动结束后／跟进与转化（Close 中学生／家长跟进7步骤）', desc: '保留原版7个步骤，独立勾选、记录家长反馈、下次跟进时间与WhatsApp沟通备注' }
    ];

    container.innerHTML = `
      <!-- Filter & Quick Action Toolbar -->
      <div class="card no-print" style="padding:14px 18px; margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <select class="form-control" style="width:auto;" onchange="App.state.tickFilterStage=this.value; App.renderEventTicklistTab()">
              <option value="ALL" ${this.state.tickFilterStage === 'ALL' ? 'selected' : ''}>全部三个阶段 (A + B + C)</option>
              <option value="A" ${this.state.tickFilterStage === 'A' ? 'selected' : ''}>只看 阶段 A (事前推广)</option>
              <option value="B" ${this.state.tickFilterStage === 'B' ? 'selected' : ''}>只看 阶段 B (活动当天)</option>
              <option value="C" ${this.state.tickFilterStage === 'C' ? 'selected' : ''}>只看 阶段 C (事后跟进7步骤)</option>
            </select>

            <select class="form-control" style="width:auto;" onchange="App.state.tickFilterAssignee=this.value; App.renderEventTicklistTab()">
              <option value="ALL" ${this.state.tickFilterAssignee === 'ALL' ? 'selected' : ''}>全部负责老师</option>
              <option value="${this.state.currentUser?.id}" ${this.state.tickFilterAssignee === this.state.currentUser?.id ? 'selected' : ''}>只看 我负责的任务 (${this.esc(this.state.currentUser?.name)})</option>
              ${this.state.users.map(u => `<option value="${u.id}" ${this.state.tickFilterAssignee === u.id ? 'selected' : ''}>${this.esc(u.name)}</option>`).join('')}
            </select>

            <select class="form-control" style="width:auto;" onchange="App.state.tickFilterStatus=this.value; App.renderEventTicklistTab()">
              <option value="ALL" ${this.state.tickFilterStatus === 'ALL' ? 'selected' : ''}>全部执行状态</option>
              <option value="未开始" ${this.state.tickFilterStatus === '未开始' ? 'selected' : ''}>未开始</option>
              <option value="进行中" ${this.state.tickFilterStatus === '进行中' ? 'selected' : ''}>进行中</option>
              <option value="待审核" ${this.state.tickFilterStatus === '待审核' ? 'selected' : ''}>待审核</option>
              <option value="已完成" ${this.state.tickFilterStatus === '已完成' ? 'selected' : ''}>已完成</option>
              <option value="不适用" ${this.state.tickFilterStatus === '不适用' ? 'selected' : ''}>不适用</option>
            </select>

            <label style="display:inline-flex; align-items:center; gap:6px; font-size:13.5px; font-weight:700; cursor:pointer;">
              <input type="checkbox" ${this.state.tickOnlyUnfinished ? 'checked' : ''} onchange="App.state.tickOnlyUnfinished=this.checked; App.renderEventTicklistTab()" />
              只显示未完成项目 (打印/核对模式)
            </label>
          </div>

          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="App.openAddChecklistItemModal()">＋ 新增检查项 (同步至任务)</button>
          </div>
        </div>
      </div>

      <!-- Three Distinct Stages (Must Never Be Merged per Section 4) -->
      ${stages.map(st => {
        if (this.state.tickFilterStage !== 'ALL' && this.state.tickFilterStage !== st.code) return '';
        const stageItems = items.filter(i => i.stage === st.code);
        const allStageItems = (d.checklistItems || []).filter(i => i.stage === st.code);
        const doneCount = allStageItems.filter(i => i.is_checked || i.status === '已完成').length;

        return `
          <div class="stage-section" id="stage-block-${st.code}">
            <div class="stage-header">
              <div>
                <div class="stage-title-badge">
                  <span class="stage-pill">阶段 ${st.code}</span>
                  <span>${this.esc(st.name)}</span>
                </div>
                <div style="font-size:12.5px; color:var(--text-secondary); margin-top:3px;">${this.esc(st.desc)}</div>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="status-pill ${doneCount === allStageItems.length && allStageItems.length > 0 ? 'status-completed' : 'status-progress'}">
                  本阶段进度：${doneCount} / ${allStageItems.length} 项已完成
                </span>
                <button class="btn btn-secondary btn-sm no-print" onclick="App.openAddChecklistItemModal('${st.code}')">＋ 新增阶段${st.code}项目</button>
              </div>
            </div>

            <div>
              ${stageItems.length === 0 ? `<div style="padding:18px; color:var(--text-muted); font-size:14px;">当前筛选条件下无项目。</div>` : stageItems.map(item => this.renderSingleTicklistRow(item, canApprove)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    `;
  },

  renderSingleTicklistRow(item, canApprove) {
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = !item.is_checked && item.status !== '已完成' && item.status !== '不适用' && item.due_date && item.due_date < today;
    const isExpanded = !!this.state.expandedTickItems[item.id];
    const repeats = item.repeat_records || [];

    return `
      <div class="tick-row ${item.is_checked ? 'checked-row' : ''} ${isOverdue ? 'overdue-row' : ''}" id="tick-item-${item.id}">
        <div class="tick-main">
          <div class="tick-left">
            <!-- Instant Save Checkbox -->
            <button
              class="tick-checkbox-btn ${item.is_checked ? 'checked' : ''}"
              id="tick-check-btn-${item.id}"
              onclick="App.toggleChecklistItem('${item.id}', ${item.is_checked ? 0 : 1})"
              title="点击即时打勾并写入数据库"
            >
              ${item.is_checked ? '✓' : ''}
            </button>

            <div class="tick-info">
              <div class="tick-title-line">
                <span style="font-size:12px; font-weight:700; color:var(--text-muted);">#${item.sort_order}</span>
                <span class="tick-title">${this.esc(item.title)}</span>
                <span style="font-size:11.5px; padding:1px 7px; border-radius:4px; background:var(--bg-subtle); color:var(--text-secondary);">${this.esc(item.category_tag)}</span>
                ${item.is_required ? `<span style="font-size:11.5px; padding:1px 6px; border-radius:4px; background:#FEF2F2; color:#C8102E; font-weight:700;">必需项目</span>` : ''}
                ${this.statusBadge(item.status, item.due_date, item.is_checked)}
                ${this.approvalBadge(item.approval_status)}
              </div>

              <div class="tick-meta-line">
                <span>👤 负责老师：<strong>${this.esc(item.assignee_name)}</strong></span>
                <span>📅 截止日期：<strong style="color:${isOverdue ? '#B91C1C' : 'inherit'};">${this.esc(item.due_date || '未设')}</strong></span>
                ${item.is_checked ? `
                  <span style="color:#15803D; font-weight:600;">
                    ✓ 完成于：${this.esc(item.completed_date)} ${this.esc(item.completed_time)} (由 ${this.esc(item.completed_by_name || '老师')} 完成)
                  </span>
                ` : ''}
                ${item.reviewed_at ? `
                  <span style="color:#1D4ED8;">
                    🛡️ 审核人：${this.esc(item.reviewer_name)} (${this.esc(item.reviewed_at)})
                  </span>
                ` : ''}
              </div>

              ${item.rejection_reason ? `
                <div style="margin-top:6px; padding:6px 10px; background:#FEF2F2; border-left:3px solid #DC2626; color:#991B1B; font-size:12.5px; border-radius:4px;">
                  <strong>❗ 主管退回/补充原因：</strong> ${this.esc(item.rejection_reason)}
                </div>
              ` : ''}

              ${item.notes ? `
                <div style="margin-top:5px; font-size:13px; color:var(--text-secondary);">
                  💬 备注：${this.esc(item.notes)}
                </div>
              ` : ''}

              ${item.evidence_name ? `
                <div style="margin-top:4px; font-size:12.5px;">
                  📎 完成证据/附件：<a href="${this.esc(item.evidence_url || '#')}" target="_blank" style="color:var(--brand-red); font-weight:600;">${this.esc(item.evidence_name)}</a>
                </div>
              ` : ''}

              <!-- Multi-round execution summary pill for Stage A repeatable items -->
              ${item.allow_repeat ? `
                <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
                  ${repeats.map((r, rIdx) => `
                    <span style="font-size:12px; padding:2px 8px; border-radius:4px; border:1px solid ${r.completed ? '#86EFAC' : '#CBD5E1'}; background:${r.completed ? '#DCFCE7' : '#F8FAFC'}; color:${r.completed ? '#15803D' : '#475569'}; cursor:pointer;"
                          onclick="App.toggleRepeatRound('${item.id}', ${rIdx})">
                      ${r.completed ? '☑' : '☐'} ${this.esc(r.round)}${r.date ? ` (${this.esc(r.date)})` : ''}
                    </span>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Quick Action Controls on Right -->
          <div class="tick-actions no-print">
            <!-- Quick Teacher Assignment Dropdown -->
            <select
              class="form-control"
              style="padding:4px 8px; font-size:12.5px; width:auto;"
              onchange="App.quickUpdateChecklistItem('${item.id}', { assignee_id: this.value })"
              title="指派负责老师（自动同步到该老师的「我的任务」）"
            >
              ${this.state.users.map(u => `<option value="${u.id}" ${u.id === item.assignee_id ? 'selected' : ''}>👤 ${this.esc(u.name)}</option>`).join('')}
            </select>

            <!-- Quick Status Dropdown -->
            <select
              class="form-control"
              style="padding:4px 8px; font-size:12.5px; width:auto;"
              onchange="App.quickUpdateChecklistItem('${item.id}', { status: this.value })"
            >
              ${['未开始', '进行中', '待审核', '已完成', '不适用'].map(st => `<option value="${st}" ${st === item.status ? 'selected' : ''}>${st}</option>`).join('')}
            </select>

            ${canApprove ? `
              <button class="btn btn-success btn-sm" onclick="App.approveChecklistItem('${item.id}', '审核通过')" title="主管二层确认：审核通过">✓ 审核通过</button>
              <button class="btn btn-secondary btn-sm" style="color:#B91C1C; border-color:#FCA5A5;" onclick="App.openRejectModal('${item.id}')">↩ 退回/转派</button>
            ` : ''}

            <button class="btn btn-secondary btn-sm" onclick="App.toggleExpandTickItem('${item.id}')">
              ${isExpanded ? '收起详情 ▲' : '展开备注/详情 ▼'}
            </button>
          </div>
        </div>

        <!-- Inline Expandable Drawer (No page jumping required per Section 4!) -->
        ${isExpanded ? this.renderTickItemExpandedDrawer(item) : ''}
      </div>
    `;
  },

  renderTickItemExpandedDrawer(item) {
    const repeats = item.repeat_records || [];
    return `
      <div class="tick-drawer no-print">
        <div class="form-grid" style="margin-bottom:12px;">
          <div class="form-group">
            <label>修改检查项名称（可自由修改措辞）</label>
            <input type="text" class="form-control" id="chk-title-${item.id}" value="${this.esc(item.title)}" />
          </div>
          <div class="form-group">
            <label>截止日期 / 计划执行日期</label>
            <input type="date" class="form-control" id="chk-due-${item.id}" value="${this.esc(item.due_date)}" />
          </div>
          <div class="form-group">
            <label>附件／完成证据名称或链接</label>
            <input type="text" class="form-control" id="chk-evname-${item.id}" placeholder="例如：海报终稿.jpg 或 Google Drive 链接" value="${this.esc(item.evidence_name)}" />
          </div>
          <div class="form-group">
            <label>是否设为关键必需准备项目</label>
            <select class="form-control" id="chk-req-${item.id}">
              <option value="1" ${item.is_required ? 'selected' : ''}>是（未完成时触发活动准备就绪提醒）</option>
              <option value="0" ${!item.is_required ? 'selected' : ''}>否（一般选配项目）</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label>执行备注 / 实际完成情况记录</label>
          <textarea class="form-control" id="chk-notes-${item.id}" rows="2" placeholder="可直接在此填写进度说明、与讲师沟通细节或家长反应...">${this.esc(item.notes)}</textarea>
        </div>

        ${item.stage === 'C' ? `
          <div style="background:#FFFFFF; padding:12px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:12px;">
            <div style="font-weight:700; font-size:13px; color:var(--brand-red); margin-bottom:8px;">📞 阶段 C 专属：家长跟进详情记录</div>
            <div class="form-grid">
              <div class="form-group">
                <label>联络状态</label>
                <select class="form-control" id="chk-contact-${item.id}">
                  <option value="" ${!item.contact_status ? 'selected' : ''}>-- 请选择 --</option>
                  <option value="已联络" ${item.contact_status === '已联络' ? 'selected' : ''}>已联络</option>
                  <option value="未回复" ${item.contact_status === '未回复' ? 'selected' : ''}>未回复</option>
                  <option value="需再次联络" ${item.contact_status === '需再次联络' ? 'selected' : ''}>需再次联络</option>
                </select>
              </div>
              <div class="form-group">
                <label>下一次跟进时间</label>
                <input type="date" class="form-control" id="chk-nextdate-${item.id}" value="${this.esc(item.next_followup_date)}" />
              </div>
              <div class="form-group">
                <label>家长反馈摘要</label>
                <input type="text" class="form-control" id="chk-pfeedback-${item.id}" value="${this.esc(item.parent_feedback)}" placeholder="家长对活动及体验课的反馈" />
              </div>
              <div class="form-group">
                <label>WhatsApp 沟通备注</label>
                <input type="text" class="form-control" id="chk-wanotes-${item.id}" value="${this.esc(item.whatsapp_notes)}" placeholder="已发送教材/Voucher记录" />
              </div>
            </div>
          </div>
        ` : ''}

        ${item.allow_repeat ? `
          <div style="background:#FFFFFF; padding:12px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="font-size:13px; color:var(--text-primary);">🔁 多次重复发布／推广执行记录（每次可独立打勾保存）</strong>
              <button class="btn btn-secondary btn-sm" onclick="App.addRepeatRound('${item.id}')">＋ 新增一次执行记录</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${repeats.map((r, rIdx) => `
                <div style="display:grid; grid-template-columns: 140px 140px 150px 1fr auto; gap:8px; align-items:center;">
                  <label style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:13px; cursor:pointer;">
                    <input type="checkbox" ${r.completed ? 'checked' : ''} onchange="App.toggleRepeatRound('${item.id}', ${rIdx})" />
                    <span>${this.esc(r.round)}</span>
                  </label>
                  <input type="date" class="form-control" value="${this.esc(r.date)}" onchange="App.updateRepeatField('${item.id}', ${rIdx}, 'date', this.value)" />
                  <input type="text" class="form-control" placeholder="执行老师" value="${this.esc(r.assignee)}" onchange="App.updateRepeatField('${item.id}', ${rIdx}, 'assignee', this.value)" />
                  <input type="text" class="form-control" placeholder="执行结果（如：已发5个群，12人询问）" value="${this.esc(r.result)}" onchange="App.updateRepeatField('${item.id}', ${rIdx}, 'result', this.value)" />
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button class="btn btn-danger btn-sm" onclick="App.deleteChecklistItem('${item.id}')">🗑️ 删除此项</button>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="App.toggleExpandTickItem('${item.id}')">取消</button>
            <button class="btn btn-primary btn-sm" onclick="App.saveExpandedTickItem('${item.id}')">💾 保存详情修改</button>
          </div>
        </div>
      </div>
    `;
  },

  toggleExpandTickItem(itemId) {
    this.state.expandedTickItems[itemId] = !this.state.expandedTickItems[itemId];
    this.renderEventTicklistTab();
  },

  async toggleChecklistItem(itemId, checkedVal) {
    await this.api(`/api/checklist-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_checked: checkedVal === 1 })
    });
    this.toast(checkedVal === 1 ? '已勾选完成并实时写入数据库（任务列表已同步）' : '已取消勾选并更新状态');
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  },

  async quickUpdateChecklistItem(itemId, payload) {
    await this.api(`/api/checklist-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    this.toast('检查项已更新并同步至老师任务');
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  },

  async saveExpandedTickItem(itemId) {
    const title = document.getElementById(`chk-title-${itemId}`)?.value;
    const due_date = document.getElementById(`chk-due-${itemId}`)?.value;
    const evidence_name = document.getElementById(`chk-evname-${itemId}`)?.value;
    const is_required = document.getElementById(`chk-req-${itemId}`)?.value === '1';
    const notes = document.getElementById(`chk-notes-${itemId}`)?.value;
    const contact_status = document.getElementById(`chk-contact-${itemId}`)?.value;
    const next_followup_date = document.getElementById(`chk-nextdate-${itemId}`)?.value;
    const parent_feedback = document.getElementById(`chk-pfeedback-${itemId}`)?.value;
    const whatsapp_notes = document.getElementById(`chk-wanotes-${itemId}`)?.value;

    await this.api(`/api/checklist-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title,
        due_date,
        evidence_name,
        evidence_url: evidence_name && evidence_name.startsWith('http') ? evidence_name : '/assets/sample-poster.svg',
        is_required,
        notes,
        contact_status,
        next_followup_date,
        parent_feedback,
        whatsapp_notes
      })
    });
    this.toast('检查项详情与备注已保存');
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  },

  async toggleRepeatRound(itemId, roundIndex) {
    const item = this.state.currentEventData.checklistItems.find(i => i.id === itemId);
    if (!item) return;
    const repeats = [...(item.repeat_records || [])];
    if (!repeats[roundIndex]) return;
    repeats[roundIndex].completed = !repeats[roundIndex].completed;
    if (repeats[roundIndex].completed && !repeats[roundIndex].date) {
      repeats[roundIndex].date = new Date().toISOString().slice(0, 10);
      repeats[roundIndex].assignee = this.state.currentUser?.name || '';
    }
    await this.api(`/api/checklist-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ repeat_records: repeats })
    });
    this.toast(`${repeats[roundIndex].round} 状态已保存`);
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  },

  async updateRepeatField(itemId, roundIndex, field, value) {
    const item = this.state.currentEventData.checklistItems.find(i => i.id === itemId);
    if (!item) return;
    const repeats = [...(item.repeat_records || [])];
    if (!repeats[roundIndex]) return;
    repeats[roundIndex][field] = value;
    await this.api(`/api/checklist-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ repeat_records: repeats })
    });
    this.toast('多次执行记录已自动保存');
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  },

  async addRepeatRound(itemId) {
    const item = this.state.currentEventData.checklistItems.find(i => i.id === itemId);
    if (!item) return;
    const repeats = [...(item.repeat_records || [])];
    repeats.push({
      round: `第${repeats.length + 1}次发布/执行`,
      date: new Date().toISOString().slice(0, 10),
      assignee: this.state.currentUser?.name || '',
      result: '',
      completed: false
    });
    await this.api(`/api/checklist-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ repeat_records: repeats })
    });
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  },

  async approveChecklistItem(itemId, decision, reason = '', reassignedTo = '') {
    await this.api(`/api/checklist-items/${itemId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason, reassigned_to: reassignedTo })
    });
    this.toast(`已完成主管审核：${decision}`);
    this.closeModal();
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  },

  openRejectModal(itemId) {
    const item = this.state.currentEventData.checklistItems.find(i => i.id === itemId);
    if (!item) return;
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:520px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:12px;">🛡️ 主管审核确认 / 退回修改</h3>
          <p style="font-size:13.5px; color:var(--text-secondary); margin-bottom:14px;">
            当前审核项目：<strong>${this.esc(item.title)}</strong>（当前负责老师：${this.esc(item.assignee_name)}）
          </p>
          <div class="form-group" style="margin-bottom:12px;">
            <label>审核决定</label>
            <select class="form-control" id="modal-approve-decision">
              <option value="退回修改">退回修改（状态将重置为进行中并通知老师）</option>
              <option value="需要补充资料">需要补充资料（请老师补充照片或凭证）</option>
              <option value="重新分配负责人">重新分配负责人</option>
              <option value="审核通过">审核通过</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:12px;">
            <label>退回原因 / 审核意见（必填以便老师清楚修改方向）</label>
            <textarea class="form-control" id="modal-approve-reason" rows="3" placeholder="例如：海报二维码不够清晰，请重新导出高清版并附上印刷报价单">${this.esc(item.rejection_reason)}</textarea>
          </div>
          <div class="form-group" style="margin-bottom:18px;">
            <label>负责老师（如需重新指派请选择）</label>
            <select class="form-control" id="modal-approve-reassign">
              ${this.state.users.map(u => `<option value="${u.id}" ${u.id === item.assignee_id ? 'selected' : ''}>${this.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitRejectModal('${item.id}')">确认提交审核结果</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitRejectModal(itemId) {
    const decision = document.getElementById('modal-approve-decision').value;
    const reason = document.getElementById('modal-approve-reason').value.trim();
    const reassignedTo = document.getElementById('modal-approve-reassign').value;
    if ((decision === '退回修改' || decision === '需要补充资料') && !reason) {
      return this.toast('请填写退回或需要补充资料的具体原因', 'error');
    }
    await this.approveChecklistItem(itemId, decision, reason, reassignedTo);
  },

  async deleteChecklistItem(itemId) {
    await this.api(`/api/checklist-items/${itemId}`, { method: 'DELETE' });
    this.toast('已删除该检查项');
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  },

  openAddChecklistItemModal(defaultStage = 'A') {
    const ev = this.state.currentEventData.event;
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:560px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:14px;">＋ 新增活动 SOP Ticklist 检查项</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group">
              <label>所属阶段</label>
              <select class="form-control" id="new-chk-stage">
                <option value="A" ${defaultStage === 'A' ? 'selected' : ''}>阶段 A：活动前一个月／事前推广</option>
                <option value="B" ${defaultStage === 'B' ? 'selected' : ''}>阶段 B：活动当天／现场执行</option>
                <option value="C" ${defaultStage === 'C' ? 'selected' : ''}>阶段 C：活动结束后／跟进与转化</option>
              </select>
            </div>
            <div class="form-group">
              <label>分类标签</label>
              <select class="form-control" id="new-chk-tag">
                <option value="原版SOP">原版SOP</option>
                <option value="现场准备扩展">现场准备扩展（场地/签到/安全等）</option>
                <option value="Close跟进7步骤">Close跟进7步骤</option>
                <option value="自定义扩展">自定义扩展</option>
              </select>
            </div>
            <div class="form-group" style="grid-column:1 / -1;">
              <label>检查项任务名称 *</label>
              <input type="text" class="form-control" id="new-chk-title" placeholder="例如：确认巴士接送时间表 / 现场安全急救箱核对" />
            </div>
            <div class="form-group">
              <label>指派负责老师（将自动同步到该老师的任务列表）</label>
              <select class="form-control" id="new-chk-assignee">
                ${this.state.users.map(u => `<option value="${u.id}" ${u.id === ev.leader_id ? 'selected' : ''}>${this.esc(u.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>截止日期</label>
              <input type="date" class="form-control" id="new-chk-due" value="${this.esc(ev.start_date)}" />
            </div>
            <div class="form-group">
              <label>支持多次重复执行记录（如多次发帖/群发）</label>
              <select class="form-control" id="new-chk-repeat">
                <option value="0">单次完成即可</option>
                <option value="1">支持多次独立打勾记录（第1次/第2次/第3次）</option>
              </select>
            </div>
            <div class="form-group">
              <label>是否为必需准备项</label>
              <select class="form-control" id="new-chk-req">
                <option value="1">是（关键必需项）</option>
                <option value="0">否</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:16px;">
            <label>执行说明 / 备注</label>
            <textarea class="form-control" id="new-chk-notes" rows="2"></textarea>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitNewChecklistItem()">保存并同步任务</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitNewChecklistItem() {
    const title = document.getElementById('new-chk-title').value.trim();
    if (!title) return this.toast('请输入检查项名称', 'error');
    await this.api('/api/checklist-items', {
      method: 'POST',
      body: JSON.stringify({
        event_id: this.state.currentEventId,
        stage: document.getElementById('new-chk-stage').value,
        category_tag: document.getElementById('new-chk-tag').value,
        title,
        assignee_id: document.getElementById('new-chk-assignee').value,
        due_date: document.getElementById('new-chk-due').value,
        allow_repeat: document.getElementById('new-chk-repeat').value === '1',
        is_required: document.getElementById('new-chk-req').value === '1',
        notes: document.getElementById('new-chk-notes').value
      })
    });
    this.closeModal();
    this.toast('新检查项已添加并同步至老师任务列表');
    await this.openEvent(this.state.currentEventId, 'ticklist');
  },

  openReadinessOverrideModal() {
    const ev = this.state.currentEventData.event;
    const s = this.state.currentEventData.summary;
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:500px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:10px;">⚠️ 活动准备就绪检查 · 特批继续推进</h3>
          <p style="font-size:13.5px; color:#991B1B; background:#FEF2F2; padding:10px; border-radius:6px; margin-bottom:12px;">
            系统检测到当前 <strong>仍有 ${s.criticalUnfinishedCount} 项关键准备未完成</strong>（含必需SOP项 ${s.uncompletedRequiredChecklistCount} 项、关键材料 ${s.unreadyCriticalMaterialsCount} 项）。
          </p>
          <div class="form-group" style="margin-bottom:16px;">
            <label>负责人记录特批继续推进原因 *</label>
            <textarea class="form-control" id="override-reason-input" rows="3" placeholder="例如：备用树叶包将于活动当天上午10点由林主管顺路取回，不影响下午1点正式开场">${this.esc(ev.readiness_override_reason)}</textarea>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitReadinessOverride()">保存原因并继续推进</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitReadinessOverride() {
    const reason = document.getElementById('override-reason-input').value.trim();
    if (!reason) return this.toast('请填写继续推进的原因', 'error');
    await this.api(`/api/events/${this.state.currentEventId}`, {
      method: 'PUT',
      body: JSON.stringify({ readiness_override_reason: reason, status: '准备就绪' })
    });
    this.closeModal();
    this.toast('已记录负责人特批原因并更新为准备就绪');
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  }
};


// ============================================================================
// PART 2: EVENT CREATION, EDIT, COPY & EVENT SUB-TABS (TASKS, MATERIALS, ROS, REGISTRATIONS, MARKETING, FINANCE, REVIEW, FILES, LOGS)
// ============================================================================

Object.assign(App, {
  async openCreateEventModal() {
    const defaultDate = '2026-12-20';
    const nextCodeRes = await this.api('/api/events/next-code?year=2026&month=12');
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:920px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-size:20px; font-weight:900;">✨ 建立新活动档案 (Event Creation &amp; SOP Generation)</h3>
            <button class="btn btn-secondary btn-sm" onclick="App.closeModal()">✕ 关闭</button>
          </div>

          <div style="background:var(--brand-red-light); border:1px solid var(--brand-red-border); padding:10px 14px; border-radius:8px; margin-bottom:16px; font-size:13px; color:var(--brand-red-dark);">
            💡 <strong>核心原则：</strong> 每场活动拥有唯一编号与独立数据库档案（即使同名也分开保存）。建立后系统将根据所选模板自动生成 A/B/C 三阶段完整 Ticklist 及准备节点。
          </div>

          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group">
              <label>活动名称 *</label>
              <input type="text" class="form-control" id="ce-name" placeholder="例如：2026年12月圣诞奇幻科学派对" />
            </div>
            <div class="form-group">
              <label>活动主题</label>
              <input type="text" class="form-control" id="ce-theme" placeholder="例如：冰雪奇缘STEM手作与闯关" />
            </div>
            <div class="form-group">
              <label>活动编号（自动生成，唯一）</label>
              <input type="text" class="form-control" id="ce-code" value="${this.esc(nextCodeRes.event_code)}" readonly style="background:var(--bg-subtle); font-weight:700;" />
            </div>
            <div class="form-group">
              <label>B. 选择活动 SOP 模板 *</label>
              <select class="form-control" id="ce-template">
                ${this.state.templates.map(t => `<option value="${t.id}">${this.esc(t.name)} (${this.esc(t.category)})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>活动类别 *</label>
              <select class="form-control" id="ce-category">
                <option value="假期活动">假期活动</option>
                <option value="科学实验活动">科学实验活动</option>
                <option value="节庆活动" selected>节庆活动</option>
                <option value="学生比赛">学生比赛</option>
                <option value="学生出游">学生出游</option>
                <option value="招生活动">招生活动</option>
                <option value="家长活动">家长活动</option>
                <option value="其他自定义活动">其他自定义活动</option>
              </select>
            </div>
            <div class="form-group">
              <label>活动状态</label>
              <select class="form-control" id="ce-status">
                <option value="草稿">草稿</option>
                <option value="筹备中" selected>筹备中</option>
                <option value="宣传中">宣传中</option>
                <option value="开放报名">开放报名</option>
                <option value="准备就绪">准备就绪</option>
                <option value="举办中">举办中</option>
                <option value="已结束">已结束</option>
              </select>
            </div>
            <div class="form-group">
              <label>开始日期 (自动推算年份与月份) *</label>
              <input type="date" class="form-control" id="ce-start-date" value="${defaultDate}" onchange="App.onCreateEventDateChange(this.value)" />
            </div>
            <div class="form-group">
              <label>结束日期 (支持单日及连续多日)</label>
              <input type="date" class="form-control" id="ce-end-date" value="${defaultDate}" />
            </div>
            <div class="form-group">
              <label>开始时间</label>
              <input type="time" class="form-control" id="ce-start-time" value="13:00" />
            </div>
            <div class="form-group">
              <label>结束时间</label>
              <input type="time" class="form-control" id="ce-end-time" value="16:00" />
            </div>
            <div class="form-group">
              <label>中心分行</label>
              <select class="form-control" id="ce-branch">
                <option value="总院 Main Branch">总院 Main Branch</option>
                <option value="Setia Alam 分行">Setia Alam 分行</option>
                <option value="Mount Austin 分行">Mount Austin 分行</option>
                <option value="Cheras 分行">Cheras 分行</option>
              </select>
            </div>
            <div class="form-group">
              <label>活动地点</label>
              <input type="text" class="form-control" id="ce-location" value="总院 2楼创意礼堂" />
            </div>
            <div class="form-group">
              <label>活动负责人 *</label>
              <select class="form-control" id="ce-leader">
                ${this.state.users.map(u => `<option value="${u.id}" ${u.id === 'u-leader1' ? 'selected' : ''}>${this.esc(u.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>年龄范围</label>
              <input type="text" class="form-control" id="ce-age" value="7-12岁" />
            </div>
            <div class="form-group">
              <label>预计学生人数</label>
              <input type="number" class="form-control" id="ce-exp-students" value="80" />
            </div>
            <div class="form-group">
              <label>最低开办人数</label>
              <input type="number" class="form-control" id="ce-min-students" value="30" />
            </div>
            <div class="form-group">
              <label>活动报名费用 (RM)</label>
              <input type="number" step="0.01" class="form-control" id="ce-fee" value="38" />
            </div>
            <div class="form-group">
              <label>活动总预算 (RM)</label>
              <input type="number" step="0.01" class="form-control" id="ce-budget" value="1500" />
            </div>
          </div>

          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group">
              <label>目标年级（可多选）</label>
              <div style="display:flex; gap:10px; flex-wrap:wrap; padding:8px; border:1px solid var(--border-color); border-radius:6px;">
                ${['幼儿班', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '中学组'].map(g => `
                  <label style="font-size:13px; display:inline-flex; align-items:center; gap:4px;">
                    <input type="checkbox" class="ce-grade-chk" value="${g}" ${['一年级','二年级','三年级','四年级','五年级','六年级'].includes(g) ? 'checked' : ''} /> ${g}
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="form-group">
              <label>协助老师（可多选）</label>
              <div style="display:flex; gap:10px; flex-wrap:wrap; padding:8px; border:1px solid var(--border-color); border-radius:6px;">
                ${this.state.users.map(u => `
                  <label style="font-size:13px; display:inline-flex; align-items:center; gap:4px;">
                    <input type="checkbox" class="ce-asst-chk" value="${u.id}" ${u.role_id === 'teacher' ? 'checked' : ''} /> ${this.esc(u.name)}
                  </label>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="form-grid" style="margin-bottom:16px;">
            <div class="form-group">
              <label>活动宗旨 &amp; 招生目标</label>
              <textarea class="form-control" id="ce-goals" rows="2" placeholder="例如：吸引30名非本院生出席，转化10名报读2027新学年全科补习班"></textarea>
            </div>
            <div class="form-group">
              <label>活动说明 &amp; 注意事项 / 内部备注</label>
              <textarea class="form-control" id="ce-desc" rows="2" placeholder="活动亮点、安全注意事项与内部交代"></textarea>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:1px solid var(--border-color);">
            <button class="btn btn-secondary" onclick="App.submitCreateEvent('草稿')">💾 保存为草稿</button>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
              <button class="btn btn-primary btn-lg" onclick="App.submitCreateEvent()">🚀 立即创建并进入第一页 Ticklist</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async onCreateEventDateChange(dateVal) {
    if (!dateVal) return;
    const endInput = document.getElementById('ce-end-date');
    if (endInput && endInput.value < dateVal) endInput.value = dateVal;
    const parts = dateVal.split('-');
    const res = await this.api(`/api/events/next-code?year=${parts[0]}&month=${Number(parts[1])}`);
    const codeInput = document.getElementById('ce-code');
    if (codeInput) codeInput.value = res.event_code;
  },

  async submitCreateEvent(overrideStatus) {
    const name = document.getElementById('ce-name').value.trim();
    const start_date = document.getElementById('ce-start-date').value;
    if (!name || !start_date) {
      return this.toast('请填写活动名称和开始日期', 'error');
    }
    const target_grades = Array.from(document.querySelectorAll('.ce-grade-chk:checked')).map(el => el.value);
    const assistant_ids = Array.from(document.querySelectorAll('.ce-asst-chk:checked')).map(el => el.value);

    const payload = {
      name,
      theme: document.getElementById('ce-theme').value,
      template_id: document.getElementById('ce-template').value,
      category: document.getElementById('ce-category').value,
      status: overrideStatus || document.getElementById('ce-status').value,
      start_date,
      end_date: document.getElementById('ce-end-date').value || start_date,
      start_time: document.getElementById('ce-start-time').value,
      end_time: document.getElementById('ce-end-time').value,
      branch: document.getElementById('ce-branch').value,
      location: document.getElementById('ce-location').value,
      leader_id: document.getElementById('ce-leader').value,
      age_range: document.getElementById('ce-age').value,
      expected_students: Number(document.getElementById('ce-exp-students').value) || 50,
      min_students: Number(document.getElementById('ce-min-students').value) || 20,
      fee_rm: Number(document.getElementById('ce-fee').value) || 0,
      budget_rm: Number(document.getElementById('ce-budget').value) || 1000,
      target_grades,
      assistant_ids,
      goals: document.getElementById('ce-goals').value,
      description: document.getElementById('ce-desc').value
    };

    const res = await this.api('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    this.closeModal();
    this.toast(`活动「${res.event.name}」(${res.event.event_code}) 创建成功！`);
    await this.loadInitialData();
    await this.openEvent(res.event.id, 'ticklist');
  },

  openEditEventModal() {
    const ev = this.state.currentEventData.event;
    const mNodes = ev.milestone_nodes || {};
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:860px;">
          <h3 style="font-size:19px; font-weight:800; margin-bottom:14px;">✏️ 编辑活动资料与准备节点 (${this.esc(ev.event_code)})</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group">
              <label>活动名称</label>
              <input type="text" class="form-control" id="ee-name" value="${this.esc(ev.name)}" />
            </div>
            <div class="form-group">
              <label>活动主题</label>
              <input type="text" class="form-control" id="ee-theme" value="${this.esc(ev.theme)}" />
            </div>
            <div class="form-group">
              <label>活动状态</label>
              <select class="form-control" id="ee-status">
                ${['草稿', '筹备中', '宣传中', '开放报名', '准备就绪', '举办中', '已结束', '已归档', '已取消'].map(s => `<option value="${s}" ${ev.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>阶段C跟进是否已全部完成（区分活动已举办与跟进已完成）</label>
              <select class="form-control" id="ee-followup">
                <option value="0" ${!ev.followup_completed ? 'selected' : ''}>跟进进行中（尚未完成全部家长转化跟进）</option>
                <option value="1" ${ev.followup_completed ? 'selected' : ''}>✓ 跟进已全部完成</option>
              </select>
            </div>
            <div class="form-group">
              <label>开始日期</label>
              <input type="date" class="form-control" id="ee-start" value="${this.esc(ev.start_date)}" />
            </div>
            <div class="form-group">
              <label>结束日期</label>
              <input type="date" class="form-control" id="ee-end" value="${this.esc(ev.end_date)}" />
            </div>
            <div class="form-group">
              <label>活动地点</label>
              <input type="text" class="form-control" id="ee-location" value="${this.esc(ev.location)}" />
            </div>
            <div class="form-group">
              <label>负责人</label>
              <select class="form-control" id="ee-leader">
                ${this.state.users.map(u => `<option value="${u.id}" ${u.id === ev.leader_id ? 'selected' : ''}>${this.esc(u.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>预计学生人数 (修改后自动重算所有材料需求量)</label>
              <input type="number" class="form-control" id="ee-exp" value="${ev.expected_students}" />
            </div>
            <div class="form-group">
              <label>最低开办人数</label>
              <input type="number" class="form-control" id="ee-min" value="${ev.min_students}" />
            </div>
            <div class="form-group">
              <label>报名费用 (RM)</label>
              <input type="number" step="0.01" class="form-control" id="ee-fee" value="${ev.fee_rm}" />
            </div>
            <div class="form-group">
              <label>活动总预算 (RM)</label>
              <input type="number" step="0.01" class="form-control" id="ee-budget" value="${ev.budget_rm}" />
            </div>
          </div>

          <div style="background:var(--bg-subtle); padding:12px; border-radius:8px; margin-bottom:14px;">
            <div style="font-weight:700; font-size:13.5px; margin-bottom:8px;">📅 智能筹备关键节点日期（可自由调整，Section 18.1）</div>
            <div class="form-grid">
              <div class="form-group"><label>活动前30天：开始宣传</label><input type="date" class="form-control" id="ee-m1" value="${this.esc(mNodes.promo_start || '')}" /></div>
              <div class="form-group"><label>活动前14天：核对报名和采购</label><input type="date" class="form-control" id="ee-m2" value="${this.esc(mNodes.check_reg_procure || '')}" /></div>
              <div class="form-group"><label>活动前7天：检查到货与流程</label><input type="date" class="form-control" id="ee-m3" value="${this.esc(mNodes.check_arrival_flow || '')}" /></div>
              <div class="form-group"><label>活动前1天：最终检查</label><input type="date" class="form-control" id="ee-m4" value="${this.esc(mNodes.final_check || '')}" /></div>
              <div class="form-group"><label>活动当天：现场执行</label><input type="date" class="form-control" id="ee-m5" value="${this.esc(mNodes.event_day || ev.start_date)}" /></div>
              <div class="form-group"><label>活动后1-7天：跟进和复盘</label><input type="date" class="form-control" id="ee-m6" value="${this.esc(mNodes.followup_review || '')}" /></div>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:16px;">
            <label>活动目标与说明</label>
            <textarea class="form-control" id="ee-goals" rows="2">${this.esc(ev.goals)}</textarea>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitEditEvent()">保存活动更改</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitEditEvent() {
    const milestone_nodes = {
      promo_start: document.getElementById('ee-m1').value,
      check_reg_procure: document.getElementById('ee-m2').value,
      check_arrival_flow: document.getElementById('ee-m3').value,
      final_check: document.getElementById('ee-m4').value,
      event_day: document.getElementById('ee-m5').value,
      followup_review: document.getElementById('ee-m6').value
    };
    await this.api(`/api/events/${this.state.currentEventId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('ee-name').value,
        theme: document.getElementById('ee-theme').value,
        status: document.getElementById('ee-status').value,
        followup_completed: document.getElementById('ee-followup').value === '1',
        start_date: document.getElementById('ee-start').value,
        end_date: document.getElementById('ee-end').value,
        location: document.getElementById('ee-location').value,
        leader_id: document.getElementById('ee-leader').value,
        expected_students: Number(document.getElementById('ee-exp').value),
        min_students: Number(document.getElementById('ee-min').value),
        fee_rm: Number(document.getElementById('ee-fee').value),
        budget_rm: Number(document.getElementById('ee-budget').value),
        goals: document.getElementById('ee-goals').value,
        milestone_nodes
      })
    });
    this.closeModal();
    this.toast('活动资料已保存更新');
    await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
  },

  // Copy Old Event Modal (Section 12.3)
  openCopyEventModal(sourceEventId) {
    const ev = this.state.events.find(e => e.id === sourceEventId) || this.state.currentEventData?.event;
    if (!ev) return;
    const nextYear = (Number(ev.year) || 2026) + 1;
    const newDate = `${nextYear}-${String(ev.month).padStart(2, '0')}-20`;
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:580px;">
          <h3 style="font-size:19px; font-weight:800; margin-bottom:10px;">📑 复制旧活动为新活动 (Section 12)</h3>
          <div style="background:#F0FDF4; border:1px solid #86EFAC; padding:12px; border-radius:6px; font-size:13px; color:#166534; margin-bottom:14px;">
            <strong>复制规则说明：</strong>
            <ul style="margin-left:18px; margin-top:4px;">
              <li>自动沿用原活动的完整 SOP Ticklist、活动流程表与材料清单模板</li>
              <li>所有 Ticklist 与任务完成状态<strong>自动重置为未开始</strong>，使用全新编号</li>
              <li><strong>不复制</strong>原活动的学生报名名单与付款记录</li>
              <li>原活动「${this.esc(ev.name)} (${this.esc(ev.event_code)})」历史档案100%完整保留</li>
            </ul>
          </div>
          <div class="form-grid" style="margin-bottom:16px;">
            <div class="form-group" style="grid-column:1 / -1;">
              <label>新活动名称 *</label>
              <input type="text" class="form-control" id="copy-ev-name" value="${this.esc(ev.name)} (${nextYear}版)" />
            </div>
            <div class="form-group">
              <label>新活动举行日期 *</label>
              <input type="date" class="form-control" id="copy-ev-date" value="${newDate}" />
            </div>
            <div class="form-group">
              <label>新活动负责人</label>
              <select class="form-control" id="copy-ev-leader">
                ${this.state.users.map(u => `<option value="${u.id}" ${u.id === ev.leader_id ? 'selected' : ''}>${this.esc(u.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>预计学生人数</label>
              <input type="number" class="form-control" id="copy-ev-exp" value="${ev.expected_students}" />
            </div>
            <div class="form-group">
              <label>重新调整活动总预算 (RM)</label>
              <input type="number" class="form-control" id="copy-ev-budget" value="${ev.budget_rm}" />
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitCopyEvent('${ev.id}')">确认复制并打开新活动</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitCopyEvent(sourceEventId) {
    const res = await this.api(`/api/events/${sourceEventId}/copy`, {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('copy-ev-name').value,
        start_date: document.getElementById('copy-ev-date').value,
        leader_id: document.getElementById('copy-ev-leader').value,
        expected_students: Number(document.getElementById('copy-ev-exp').value),
        budget_rm: Number(document.getElementById('copy-ev-budget').value)
      })
    });
    this.closeModal();
    this.toast(`成功复制为新活动：${res.event.name} (${res.event.event_code})，旧档案完好保留`);
    await this.loadInitialData();
    await this.openEvent(res.event.id, 'ticklist');
  },

  async saveEventAsTemplate(eventId) {
    const ev = this.state.currentEventData.event;
    await this.api('/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: `${ev.name} 专属SOP模板`,
        category: ev.category,
        description: `从成功活动 ${ev.name} (${ev.event_code}) 提取保存的SOP模板`,
        from_event_id: eventId
      })
    });
    this.toast('已将该活动的 SOP Ticklist 保存为新的可复用模板！');
  },

  // ============================================================================
  // EVENT SUB-TAB 2: TEACHER TASK ASSIGNMENT (Bidirectionally Synced with Ticklist)
  // ============================================================================
  renderEventTasksTab() {
    const container = document.getElementById('event-subtab-container');
    const d = this.state.currentEventData;
    const tasks = d.tasks || [];

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">👩‍🏫 本场活动老师任务安排 (与第一页 Ticklist 100% 双向实时同步)</div>
            <div style="font-size:13px; color:var(--text-secondary); margin-top:2px;">
              在 Ticklist 指派老师或勾选完成，此处立即更新；老师在「我的任务」中完成后，第一页 Ticklist 自动同步完成状态。
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="App.openAddTaskModal('${d.event.id}')">＋ 新增任务</button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>阶段</th>
                <th>任务名称</th>
                <th>负责老师</th>
                <th>优先级</th>
                <th>截止日期</th>
                <th>任务状态</th>
                <th>审核状态</th>
                <th>备注</th>
                <th>快速操作</th>
              </tr>
            </thead>
            <tbody>
              ${tasks.map(t => `
                <tr>
                  <td><span class="stage-pill">阶段 ${this.esc(t.stage)}</span></td>
                  <td style="font-weight:700;">
                    ${this.esc(t.title)}
                    ${t.checklist_item_id ? `<span style="font-size:11px; color:#1D4ED8; background:#DBEAFE; padding:1px 6px; border-radius:4px; margin-left:4px;">已联动Ticklist</span>` : ''}
                  </td>
                  <td>
                    <select class="form-control" style="padding:4px 8px; font-size:12.5px;" onchange="App.updateTaskQuick('${t.id}', { assignee_id: this.value })">
                      ${this.state.users.map(u => `<option value="${u.id}" ${u.id === t.assignee_id ? 'selected' : ''}>${this.esc(u.name)}</option>`).join('')}
                    </select>
                  </td>
                  <td><span class="status-pill ${t.priority === '高' ? 'status-overdue' : (t.priority === '中' ? 'status-review' : 'status-pending')}">${this.esc(t.priority)}</span></td>
                  <td>${this.esc(t.due_date)}</td>
                  <td>${this.statusBadge(t.status, t.due_date, t.status === '已完成' ? 1 : 0)}</td>
                  <td>${this.approvalBadge(t.approval_status)}</td>
                  <td style="max-width:200px; font-size:12.5px; color:var(--text-secondary);">${this.esc(t.notes || '-')}</td>
                  <td>
                    <button class="btn btn-sm ${t.status === '已完成' ? 'btn-secondary' : 'btn-success'}"
                            onclick="App.updateTaskQuick('${t.id}', { status: '${t.status === '已完成' ? '进行中' : '已完成'}' })">
                      ${t.status === '已完成' ? '设为进行中' : '✓ 标记完成'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async updateTaskQuick(taskId, payload) {
    await this.api(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    this.toast('任务状态已更新（已同步至活动第一页 Ticklist）');
    if (this.state.currentView === 'event-detail' && this.state.currentEventId) {
      await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
    } else {
      await this.loadInitialData();
      this.renderTasksView();
    }
  },

  openAddTaskModal(defaultEventId = '') {
    const evId = defaultEventId || this.state.currentEventId || (this.state.events[0]?.id || '');
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:560px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:14px;">＋ 新增老师任务 (同步至活动 Ticklist)</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group" style="grid-column:1 / -1;">
              <label>所属活动 *</label>
              <select class="form-control" id="nt-event">
                ${this.state.events.map(e => `<option value="${e.id}" ${e.id === evId ? 'selected' : ''}>${this.esc(e.name)} (${this.esc(e.event_code)})</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="grid-column:1 / -1;">
              <label>任务标题 *</label>
              <input type="text" class="form-control" id="nt-title" placeholder="例如：制作宣传海报 / 联系巴士公司确认报价" />
            </div>
            <div class="form-group">
              <label>所属阶段</label>
              <select class="form-control" id="nt-stage">
                <option value="A">阶段 A：事前推广</option>
                <option value="B">阶段 B：活动当天</option>
                <option value="C">阶段 C：事后跟进</option>
              </select>
            </div>
            <div class="form-group">
              <label>负责老师 *</label>
              <select class="form-control" id="nt-assignee">
                ${this.state.users.map(u => `<option value="${u.id}">${this.esc(u.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>截止日期</label>
              <input type="date" class="form-control" id="nt-due" value="2026-11-25" />
            </div>
            <div class="form-group">
              <label>优先级</label>
              <select class="form-control" id="nt-priority">
                <option value="高">高</option>
                <option value="中" selected>中</option>
                <option value="低">低</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:16px;">
            <label>任务内容与备注</label>
            <textarea class="form-control" id="nt-notes" rows="2"></textarea>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitNewTask()">确认分配任务</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitNewTask() {
    const title = document.getElementById('nt-title').value.trim();
    const event_id = document.getElementById('nt-event').value;
    if (!title || !event_id) return this.toast('请填写任务标题并选择活动', 'error');
    await this.api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        event_id,
        title,
        stage: document.getElementById('nt-stage').value,
        assignee_id: document.getElementById('nt-assignee').value,
        due_date: document.getElementById('nt-due').value,
        priority: document.getElementById('nt-priority').value,
        notes: document.getElementById('nt-notes').value,
        sync_to_ticklist: true
      })
    });
    this.closeModal();
    this.toast('任务已创建并自动同步到活动 Ticklist');
    if (this.state.currentView === 'event-detail') {
      await this.openEvent(this.state.currentEventId, this.state.eventSubTab);
    } else {
      await this.loadInitialData();
      this.renderTasksView();
    }
  },

  // ============================================================================
  // EVENT SUB-TAB 3: MATERIAL PROCUREMENT & FORMULA CALCULATOR (SECTION 7)
  // ============================================================================
  renderEventMaterialsTab() {
    const container = document.getElementById('event-subtab-container');
    const d = this.state.currentEventData;
    const ev = d.event;
    const mats = d.materials || [];

    const totalActualCost = mats.reduce((s, m) => s + (Number(m.final_actual_cost) || 0), 0);
    const totalOriginalPlan = mats.reduce((s, m) => s + (m.need_purchase_qty > 0 ? m.need_purchase_qty * (m.original_price || m.unit_price) + (m.shipping_fee || 0) : 0), 0);
    const totalAirPlan = mats.reduce((s, m) => s + (m.need_purchase_qty > 0 ? m.need_purchase_qty * (m.air_freight_price || m.unit_price) + (m.shipping_fee || 0) : 0), 0);
    const studentCountForAvg = ev.actual_students > 0 ? ev.actual_students : (ev.expected_students || 1);
    const costPerStudent = totalActualCost / studentCountForAvg;

    const stepLabels = [
      { key: 'step_confirmed', label: '已确认需要' },
      { key: 'step_stock_checked', label: '已检查库存' },
      { key: 'step_decided_buy', label: '已决定购买' },
      { key: 'step_ordered', label: '已下单' },
      { key: 'step_paid', label: '已付款' },
      { key: 'step_arrived', label: '已到货' },
      { key: 'step_counted', label: '已点算数量' },
      { key: 'step_allocated', label: '已分配到活动' },
      { key: 'step_ready', label: '已准备完成' }
    ];

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">预计/实际学生基数</div>
          <div class="kpi-value">${ev.expected_students} 人</div>
          <div class="kpi-sub">实际已出席: ${ev.actual_students} 人</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">原价方案总成本估算</div>
          <div class="kpi-value">RM ${totalOriginalPlan.toFixed(2)}</div>
          <div class="kpi-sub">按本地/原价计算的采购总额</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">空运方案总成本估算</div>
          <div class="kpi-value" style="color:#1D4ED8;">RM ${totalAirPlan.toFixed(2)}</div>
          <div class="kpi-sub">按跨境空运单价计算</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">最终实际采购总成本</div>
          <div class="kpi-value" style="color:var(--brand-red);">RM ${totalActualCost.toFixed(2)}</div>
          <div class="kpi-sub">每人平均材料成本: <strong>RM ${costPerStudent.toFixed(2)} /人</strong></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">📦 活动材料需求精算与9步采购追踪表 (支持 RM 马来西亚令吉)</div>
            <div style="font-size:12.5px; color:var(--text-secondary); margin-top:2px;">
              公式：<strong>所需总数量 = 每人数量 × 预计人数(${ev.expected_students}) ＋ 固定额外数量 ＋ 安全备用数量</strong> ｜ <strong>需购买数量 = MAX(0, 所需总数量 − 可用库存)</strong>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="App.navigate('materials')">查看中心共用总库存</button>
            <button class="btn btn-primary btn-sm" onclick="App.openAddMaterialModal()">＋ 新增活动材料</button>
          </div>
        </div>

        ${mats.length === 0 ? `<p style="padding:18px; color:var(--text-muted);">暂未添加活动材料，请点击右上角「＋ 新增活动材料」。</p>` : `
          <div style="display:flex; flex-direction:column; gap:14px;">
            ${mats.map(m => `
              <div style="border:1px solid var(--border-color); border-radius:8px; padding:14px; background:#FFFFFF;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                  <div>
                    <span style="font-weight:800; font-size:16px;">${this.esc(m.name)}</span>
                    <span style="font-size:12px; background:var(--bg-subtle); padding:2px 8px; border-radius:4px; margin-left:6px;">${this.esc(m.category)} · 单位: ${this.esc(m.unit)}</span>
                    <span style="font-size:12.5px; color:var(--text-secondary); margin-left:8px;">用途：${this.esc(m.purpose || '-')} | 采购老师：<strong>${this.esc(m.buyer_name)}</strong></span>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="status-pill ${m.step_ready ? 'status-completed' : 'status-progress'}">${this.esc(m.procurement_status)}</span>
                    <button class="btn btn-secondary btn-sm" onclick="App.openEditMaterialModal('${m.id}')">✏️ 编辑数量/单价</button>
                    <button class="btn btn-danger btn-sm" onclick="App.deleteEventMaterial('${m.id}')">删除</button>
                  </div>
                </div>

                <!-- Formula Breakdown Grid -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(135px, 1fr)); gap:8px; background:var(--bg-subtle); padding:10px 12px; border-radius:6px; font-size:12.5px; margin-bottom:10px;">
                  <div>每人数量: <strong>${m.qty_per_student} ${this.esc(m.unit)}</strong></div>
                  <div>预计人数: <strong>${m.expected_students} 人</strong></div>
                  <div>固定额外: <strong>+${m.fixed_extra_qty}</strong> | 备用: <strong>+${m.safety_buffer_qty}</strong></div>
                  <div style="color:#1D4ED8;">所需总数量: <strong>${m.total_required_qty} ${this.esc(m.unit)}</strong></div>
                  <div style="color:#15803D;">现有可用库存: <strong>${m.current_stock_available} ${this.esc(m.unit)}</strong></div>
                  <div style="color:var(--brand-red); font-size:13.5px;">需购买数量: <strong>${m.need_purchase_qty} ${this.esc(m.unit)}</strong></div>
                  <div>原价/空运/海运: RM ${Number(m.original_price).toFixed(2)} / ${Number(m.air_freight_price).toFixed(2)} / ${Number(m.sea_freight_price).toFixed(2)}</div>
                  <div>运费: RM ${Number(m.shipping_fee).toFixed(2)}</div>
                  <div style="font-weight:800; color:var(--text-primary);">最终实际成本: <span style="color:var(--brand-red);">RM ${Number(m.final_actual_cost).toFixed(2)}</span></div>
                </div>

                <!-- 9-Step Procurement Ticklist -->
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:12.5px;">
                  <strong style="color:var(--text-secondary);">9步采购流程打勾：</strong>
                  ${stepLabels.map(st => `
                    <label style="display:inline-flex; align-items:center; gap:4px; padding:4px 9px; border-radius:6px; border:1px solid ${m[st.key] ? '#86EFAC' : '#CBD5E1'}; background:${m[st.key] ? '#DCFCE7' : '#F8FAFC'}; color:${m[st.key] ? '#15803D' : '#475569'}; font-weight:600; cursor:pointer;">
                      <input type="checkbox" ${m[st.key] ? 'checked' : ''} onchange="App.toggleMaterialStep('${m.id}', '${st.key}', this.checked)" />
                      ${st.label}
                    </label>
                  `).join('')}
                </div>

                <div style="margin-top:8px; font-size:12px; color:var(--text-muted); display:flex; gap:16px; flex-wrap:wrap;">
                  <span>🏢 供应商：${this.esc(m.supplier_name || '未填')}</span>
                  ${m.purchase_link ? `<span>🔗 <a href="${this.esc(m.purchase_link)}" target="_blank" style="color:var(--brand-red);">购买链接</a></span>` : ''}
                  <span>🚚 预计到货：${this.esc(m.expected_arrival_date || '-')} | 实际到货：${this.esc(m.actual_arrival_date || '-')}</span>
                  ${m.notes ? `<span>📝 备注：${this.esc(m.notes)}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  },

  async toggleMaterialStep(reqId, stepKey, isChecked) {
    await this.api(`/api/event-materials/${reqId}`, {
      method: 'PUT',
      body: JSON.stringify({ [stepKey]: isChecked })
    });
    this.toast('材料采购步骤已更新并实时保存');
    await this.openEvent(this.state.currentEventId, 'materials');
  },

  openAddMaterialModal() {
    const ev = this.state.currentEventData.event;
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:780px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:12px;">＋ 新增活动材料需求（系统自动计算总需求与采购数量）</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group">
              <label>材料名称 *</label>
              <input type="text" class="form-control" id="nm-name" placeholder="例如：彩纸 / 森林面具胚 / 双面胶" />
            </div>
            <div class="form-group">
              <label>用途</label>
              <input type="text" class="form-control" id="nm-purpose" placeholder="例如：学生折纸与手工装饰" />
            </div>
            <div class="form-group">
              <label>材料分类</label>
              <select class="form-control" id="nm-category">
                <option value="手工美术">手工美术</option>
                <option value="科学实验器材">科学实验器材</option>
                <option value="文具耗材">文具耗材</option>
                <option value="礼品奖品">礼品奖品</option>
                <option value="场地布置">场地布置</option>
              </select>
            </div>
            <div class="form-group">
              <label>单位</label>
              <select class="form-control" id="nm-unit">
                <option value="张">张</option>
                <option value="个">个</option>
                <option value="包">包</option>
                <option value="卷">卷</option>
                <option value="套">套</option>
                <option value="瓶">瓶</option>
              </select>
            </div>
            <div class="form-group">
              <label>负责购买老师</label>
              <select class="form-control" id="nm-buyer">
                ${this.state.users.map(u => `<option value="${u.id}">${this.esc(u.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>预计参加学生人数</label>
              <input type="number" class="form-control" id="nm-exp" value="${ev.expected_students}" oninput="App.previewMatCalc()" />
            </div>
            <div class="form-group">
              <label>每位学生使用数量 *</label>
              <input type="number" step="0.01" class="form-control" id="nm-per-student" value="2" oninput="App.previewMatCalc()" />
            </div>
            <div class="form-group">
              <label>固定额外使用数量 (如老师示范用)</label>
              <input type="number" step="0.01" class="form-control" id="nm-fixed" value="0" oninput="App.previewMatCalc()" />
            </div>
            <div class="form-group">
              <label>安全备用数量 *</label>
              <input type="number" step="0.01" class="form-control" id="nm-buffer" value="10" oninput="App.previewMatCalc()" />
            </div>
            <div class="form-group">
              <label>现有可用库存数量</label>
              <input type="number" step="0.01" class="form-control" id="nm-stock" value="0" oninput="App.previewMatCalc()" />
            </div>
            <div class="form-group">
              <label>购买单价 (RM)</label>
              <input type="number" step="0.01" class="form-control" id="nm-price" value="0.50" oninput="App.previewMatCalc()" />
            </div>
            <div class="form-group">
              <label>运费 (RM)</label>
              <input type="number" step="0.01" class="form-control" id="nm-ship" value="0" oninput="App.previewMatCalc()" />
            </div>
            <div class="form-group">
              <label>原价 (RM)</label>
              <input type="number" step="0.01" class="form-control" id="nm-orig-price" value="0.60" />
            </div>
            <div class="form-group">
              <label>空运价 (RM)</label>
              <input type="number" step="0.01" class="form-control" id="nm-air-price" value="0.50" />
            </div>
            <div class="form-group">
              <label>供应商 &amp; 购买链接</label>
              <input type="text" class="form-control" id="nm-supplier" placeholder="Shopee / 大众书局" />
            </div>
            <div class="form-group">
              <label>预计到货日期</label>
              <input type="date" class="form-control" id="nm-arrival" value="${this.esc(ev.start_date)}" />
            </div>
          </div>

          <div id="nm-calc-preview" style="background:#EFF6FF; border:1px solid #93C5FD; padding:12px; border-radius:6px; margin-bottom:14px; font-size:13.5px; font-weight:700; color:#1E3A8A;">
            实时计算预览：所需总数量 = 210 ｜ 扣减库存后需购买数量 = 210 ｜ 预计总成本 = RM 105.00
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitAddMaterial()">保存材料并同步财务预算</button>
          </div>
        </div>
      </div>
    `;
    this.previewMatCalc();
  },

  previewMatCalc() {
    const exp = Number(document.getElementById('nm-exp')?.value) || 0;
    const per = Number(document.getElementById('nm-per-student')?.value) || 0;
    const fix = Number(document.getElementById('nm-fixed')?.value) || 0;
    const buf = Number(document.getElementById('nm-buffer')?.value) || 0;
    const stk = Number(document.getElementById('nm-stock')?.value) || 0;
    const prc = Number(document.getElementById('nm-price')?.value) || 0;
    const shp = Number(document.getElementById('nm-ship')?.value) || 0;

    const totalReq = Number((per * exp + fix + buf).toFixed(2));
    const needBuy = Math.max(0, Number((totalReq - stk).toFixed(2)));
    const totalCost = needBuy > 0 ? (needBuy * prc + shp) : 0;
    const el = document.getElementById('nm-calc-preview');
    if (el) {
      el.innerHTML = `🧮 实时计算预览：所需总数量 = <strong>${totalReq}</strong> (${per} × ${exp}人 + 固定${fix} + 备用${buf}) ｜ 扣减可用库存(${stk})后需购买数量 = <strong style="color:var(--brand-red);">${needBuy}</strong> ｜ 最终实际成本 = <strong>RM ${totalCost.toFixed(2)}</strong>`;
    }
  },

  async submitAddMaterial() {
    const name = document.getElementById('nm-name').value.trim();
    if (!name) return this.toast('请填写材料名称', 'error');
    await this.api('/api/event-materials', {
      method: 'POST',
      body: JSON.stringify({
        event_id: this.state.currentEventId,
        name,
        purpose: document.getElementById('nm-purpose').value,
        category: document.getElementById('nm-category').value,
        unit: document.getElementById('nm-unit').value,
        buyer_id: document.getElementById('nm-buyer').value,
        expected_students: Number(document.getElementById('nm-exp').value),
        qty_per_student: Number(document.getElementById('nm-per-student').value),
        fixed_extra_qty: Number(document.getElementById('nm-fixed').value),
        safety_buffer_qty: Number(document.getElementById('nm-buffer').value),
        current_stock_available: Number(document.getElementById('nm-stock').value),
        unit_price: Number(document.getElementById('nm-price').value),
        shipping_fee: Number(document.getElementById('nm-ship').value),
        original_price: Number(document.getElementById('nm-orig-price').value),
        air_freight_price: Number(document.getElementById('nm-air-price').value),
        supplier_name: document.getElementById('nm-supplier').value,
        expected_arrival_date: document.getElementById('nm-arrival').value
      })
    });
    this.closeModal();
    this.toast('材料已新增并自动完成数量与预算精算');
    await this.openEvent(this.state.currentEventId, 'materials');
  },

  openEditMaterialModal(reqId) {
    const m = this.state.currentEventData.materials.find(x => x.id === reqId);
    if (!m) return;
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:680px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:12px;">✏️ 编辑材料参数：${this.esc(m.name)}</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group"><label>材料名称</label><input type="text" class="form-control" id="em-name" value="${this.esc(m.name)}" /></div>
            <div class="form-group"><label>每位学生使用数量</label><input type="number" step="0.01" class="form-control" id="em-per" value="${m.qty_per_student}" /></div>
            <div class="form-group"><label>固定额外数量</label><input type="number" step="0.01" class="form-control" id="em-fix" value="${m.fixed_extra_qty}" /></div>
            <div class="form-group"><label>安全备用数量</label><input type="number" step="0.01" class="form-control" id="em-buf" value="${m.safety_buffer_qty}" /></div>
            <div class="form-group"><label>现有可用库存</label><input type="number" step="0.01" class="form-control" id="em-stk" value="${m.current_stock_available}" /></div>
            <div class="form-group"><label>购买单价 (RM)</label><input type="number" step="0.01" class="form-control" id="em-prc" value="${m.unit_price}" /></div>
            <div class="form-group"><label>运费 (RM)</label><input type="number" step="0.01" class="form-control" id="em-shp" value="${m.shipping_fee}" /></div>
            <div class="form-group"><label>实际到货日期</label><input type="date" class="form-control" id="em-arr" value="${this.esc(m.actual_arrival_date)}" /></div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitEditMaterial('${m.id}')">保存并重新计算</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitEditMaterial(reqId) {
    await this.api(`/api/event-materials/${reqId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('em-name').value,
        qty_per_student: Number(document.getElementById('em-per').value),
        fixed_extra_qty: Number(document.getElementById('em-fix').value),
        safety_buffer_qty: Number(document.getElementById('em-buf').value),
        current_stock_available: Number(document.getElementById('em-stk').value),
        unit_price: Number(document.getElementById('em-prc').value),
        shipping_fee: Number(document.getElementById('em-shp').value),
        actual_arrival_date: document.getElementById('em-arr').value
      })
    });
    this.closeModal();
    this.toast('材料数据已重新计算并保存');
    await this.openEvent(this.state.currentEventId, 'materials');
  },

  async deleteEventMaterial(reqId) {
    await this.api(`/api/event-materials/${reqId}`, { method: 'DELETE' });
    this.toast('已删除材料记录');
    await this.openEvent(this.state.currentEventId, 'materials');
  },

  // ============================================================================
  // EVENT SUB-TAB 4: RUN OF SHOW SCHEDULE & ON-SITE LIVE EXECUTION MODE (SECTION 8)
  // ============================================================================
  renderEventScheduleTab() {
    const container = document.getElementById('event-subtab-container');
    const d = this.state.currentEventData;
    const scheds = d.schedules || [];
    const nextPending = scheds.find(s => !s.is_completed);

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">⏱️ 活动当天流程安排表 Run of Show</div>
            <div style="font-size:13px; color:var(--text-secondary);">支持上下顺序调整、修改时间自动保持正确时间序，以及活动当天大按钮「现场执行模式」。</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn ${this.state.liveRosMode ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="App.state.liveRosMode=!App.state.liveRosMode; App.renderEventScheduleTab()">
              ${this.state.liveRosMode ? '🔴 退出现场执行模式' : '⚡ 进入活动当天「现场执行模式」'}
            </button>
            <button class="btn btn-primary btn-sm" onclick="App.openAddScheduleModal()">＋ 新增流程环节</button>
          </div>
        </div>

        ${this.state.liveRosMode ? `
          <div style="background:#0F172A; color:#FFFFFF; padding:22px; border-radius:12px; margin-bottom:20px;">
            <div style="font-size:13px; color:#FCD34D; font-weight:700; margin-bottom:6px;">⚡ 活动现场实时控场模式 (大按钮单手操作)</div>
            ${nextPending ? `
              <div style="font-size:24px; font-weight:900; margin-bottom:8px;">
                当前/下一环节：${this.esc(nextPending.start_time)} - ${this.esc(nextPending.end_time)} ｜ ${this.esc(nextPending.title)}
              </div>
              <div style="font-size:14.5px; color:#CBD5E1; margin-bottom:14px;">
                👤 负责老师：<strong>${this.esc(nextPending.assignee_name)}</strong> ｜ 📍 场地：<strong>${this.esc(nextPending.venue)}</strong> ｜ 📦 所需材料：<strong>${this.esc(nextPending.materials_needed || '无')}</strong>
              </div>
              <button class="btn btn-success btn-lg" style="width:100%; font-size:18px; padding:16px;" onclick="App.toggleScheduleComplete('${nextPending.id}', 1)">
                ✓ 完成本环节 (${this.esc(nextPending.title)}) 并推进至下一关
              </button>
            ` : `
              <div style="font-size:22px; font-weight:800; color:#4ADE80;">🎉 恭喜！本场活动所有现场流程环节已全部圆满执行完毕！</div>
            `}
          </div>
        ` : ''}

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${scheds.map((s, idx) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; padding:14px 16px; border:1px solid var(--border-color); border-left:5px solid ${s.is_completed ? '#16A34A' : 'var(--brand-red)'}; border-radius:8px; background:${s.is_completed ? '#F8FDF9' : '#FFFFFF'}; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:14px; flex:1; min-width:260px;">
                <button class="tick-checkbox-btn ${s.is_completed ? 'checked' : ''}" onclick="App.toggleScheduleComplete('${s.id}', ${s.is_completed ? 0 : 1})">
                  ${s.is_completed ? '✓' : ''}
                </button>
                <div>
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-weight:900; font-size:15.5px; color:var(--brand-red);">${this.esc(s.start_time)} - ${this.esc(s.end_time)}</span>
                    <span style="font-weight:800; font-size:16px;">${this.esc(s.title)}</span>
                    <span class="status-pill ${s.is_completed ? 'status-completed' : 'status-pending'}">${s.is_completed ? '已完成' : '待执行'}</span>
                  </div>
                  <div style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
                    👤 负责：<strong>${this.esc(s.assignee_name)}</strong> ｜ 📍 场地：${this.esc(s.venue)} ｜ 📦 材料：${this.esc(s.materials_needed || '-')}
                  </div>
                  ${s.instructions ? `<div style="font-size:12.5px; color:var(--text-muted); margin-top:2px;">💡 说明：${this.esc(s.instructions)} ${s.precautions ? `| ⚠️ 注意：${this.esc(s.precautions)}` : ''}</div>` : ''}
                </div>
              </div>

              <div style="display:flex; gap:6px;" class="no-print">
                ${idx > 0 ? `<button class="btn btn-secondary btn-sm" onclick="App.moveSchedule('${s.id}', -1)" title="上移">↑</button>` : ''}
                ${idx < scheds.length - 1 ? `<button class="btn btn-secondary btn-sm" onclick="App.moveSchedule('${s.id}', 1)" title="下移">↓</button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="App.deleteSchedule('${s.id}')">删除</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  async toggleScheduleComplete(id, val) {
    await this.api(`/api/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_completed: val === 1, status: val === 1 ? '已完成' : '未开始' })
    });
    this.toast(val === 1 ? '流程环节已打勾完成' : '已重置环节状态');
    await this.openEvent(this.state.currentEventId, 'schedule');
  },

  async moveSchedule(id, dir) {
    const scheds = [...(this.state.currentEventData.schedules || [])];
    const idx = scheds.findIndex(s => s.id === id);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= scheds.length) return;
    const temp = scheds[idx];
    scheds[idx] = scheds[targetIdx];
    scheds[targetIdx] = temp;
    await this.api('/api/schedules/reorder', {
      method: 'POST',
      body: JSON.stringify({ ordered_ids: scheds.map(s => s.id) })
    });
    await this.openEvent(this.state.currentEventId, 'schedule');
  },

  openAddScheduleModal() {
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:560px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:14px;">＋ 新增活动当天流程环节</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group"><label>开始时间 *</label><input type="time" class="form-control" id="ns-start" value="14:00" /></div>
            <div class="form-group"><label>结束时间 *</label><input type="time" class="form-control" id="ns-end" value="14:30" /></div>
            <div class="form-group" style="grid-column:1 / -1;"><label>环节名称 *</label><input type="text" class="form-control" id="ns-title" placeholder="例如：科学实验挑战赛 / 幸运抽奖环节" /></div>
            <div class="form-group">
              <label>负责老师</label>
              <select class="form-control" id="ns-assignee">
                ${this.state.users.map(u => `<option value="${u.id}">${this.esc(u.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>场地</label><input type="text" class="form-control" id="ns-venue" value="主礼堂" /></div>
            <div class="form-group" style="grid-column:1 / -1;"><label>所需材料</label><input type="text" class="form-control" id="ns-mat" placeholder="实验包、计时器、奖品" /></div>
            <div class="form-group" style="grid-column:1 / -1;"><label>执行说明与注意事项</label><textarea class="form-control" id="ns-inst" rows="2"></textarea></div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitAddSchedule()">保存流程环节</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitAddSchedule() {
    const title = document.getElementById('ns-title').value.trim();
    if (!title) return this.toast('请填写环节名称', 'error');
    await this.api('/api/schedules', {
      method: 'POST',
      body: JSON.stringify({
        event_id: this.state.currentEventId,
        start_time: document.getElementById('ns-start').value,
        end_time: document.getElementById('ns-end').value,
        title,
        assignee_id: document.getElementById('ns-assignee').value,
        venue: document.getElementById('ns-venue').value,
        materials_needed: document.getElementById('ns-mat').value,
        instructions: document.getElementById('ns-inst').value
      })
    });
    this.closeModal();
    this.toast('流程环节已新增并自动按时间排序');
    await this.openEvent(this.state.currentEventId, 'schedule');
  },

  async deleteSchedule(id) {
    await this.api(`/api/schedules/${id}`, { method: 'DELETE' });
    await this.openEvent(this.state.currentEventId, 'schedule');
  },

  // ============================================================================
  // EVENT SUB-TAB 5: STUDENT REGISTRATIONS & ATTENDANCE (SECTION 9)
  // ============================================================================
  renderEventRegistrationsTab() {
    const container = document.getElementById('event-subtab-container');
    const d = this.state.currentEventData;
    const ev = d.event;
    const regs = d.registrations || [];
    const s = d.summary;

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">已报名人数 / 名额上限</div>
          <div class="kpi-value">${s.activeRegistrations} / ${ev.expected_students}</div>
          <div class="kpi-sub">最低开办要求: ${ev.min_students} 人</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">非本院生报名人数</div>
          <div class="kpi-value" style="color:var(--brand-red);">${s.externalReg} 人</div>
          <div class="kpi-sub">非本院生出席: ${s.externalAttended} 人</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">实际出席总人数</div>
          <div class="kpi-value" style="color:#15803D;">${s.attendedCount} 人</div>
          <div class="kpi-sub">支持现场一键点名签到</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">实际已收报名费 (不含欠款)</div>
          <div class="kpi-value" style="color:#1D4ED8;">RM ${Number(s.totalPaidIncome).toFixed(2)}</div>
          <div class="kpi-sub">未付款报名费严格不计入实收</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">🎓 活动学生报名、收据与现场出席管理表</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">
              ${d.permissions.can_view_sensitive_contacts ? '🔓 您拥有查看完整家长联系方式权限' : '🔒 权限保护已生效：普通老师视图下家长电话已自动脱敏处理'}
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="App.openImportRegistrationsModal()">📥 导入 Excel / CSV 名单</button>
            <button class="btn btn-secondary btn-sm" onclick="App.exportRegistrationsCsv()">📤 导出签到表/付款记录 CSV</button>
            <button class="btn btn-primary btn-sm" onclick="App.openAddRegistrationModal()">＋ 新增学生报名</button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>学生姓名</th>
                <th>年级</th>
                <th>生源类型</th>
                <th>家长联系方式</th>
                <th>招生来源</th>
                <th>报名状态</th>
                <th>付款方式</th>
                <th>应付 / 已付 / 欠款 (RM)</th>
                <th>收据编号</th>
                <th>现场出席</th>
                <th>报读转化</th>
              </tr>
            </thead>
            <tbody>
              ${regs.map(r => `
                <tr>
                  <td style="font-weight:700;">${this.esc(r.student_name)}</td>
                  <td>${this.esc(r.grade)}</td>
                  <td>
                    <span class="status-pill ${r.student_type === '非本院生' ? 'status-overdue' : 'status-progress'}">
                      ${this.esc(r.student_type)}
                    </span>
                  </td>
                  <td>${this.esc(r.parent_name ? r.parent_name + ' ' : '')}${this.esc(r.parent_phone)}</td>
                  <td>${this.esc(r.source)}</td>
                  <td>
                    <select class="form-control" style="padding:2px 6px; font-size:12px;" onchange="App.updateRegistrationQuick('${r.id}', { status: this.value })">
                      ${['已报名', '候补名单', '已取消'].map(st => `<option value="${st}" ${r.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                    </select>
                  </td>
                  <td>${this.esc(r.payment_method)}</td>
                  <td>
                    <span>RM ${Number(r.payable_rm).toFixed(0)}</span> /
                    <strong style="color:#15803D;">RM ${Number(r.paid_rm).toFixed(0)}</strong> /
                    <span style="color:${r.balance_rm > 0 ? '#DC2626' : '#64748B'}; font-weight:700;">RM ${Number(r.balance_rm).toFixed(0)}</span>
                    ${r.balance_rm > 0 ? `<button class="btn btn-sm btn-secondary" style="padding:1px 6px; font-size:11px; margin-left:4px;" onclick="App.markRegistrationPaid('${r.id}', ${r.payable_rm})">收清</button>` : ''}
                  </td>
                  <td style="font-size:12px;">${this.esc(r.receipt_no || '未付无收据')}</td>
                  <td>
                    <button class="btn btn-sm ${r.attended ? 'btn-success' : 'btn-secondary'}" onclick="App.updateRegistrationQuick('${r.id}', { attended: ${r.attended ? 'false' : 'true'} })">
                      ${r.attended ? '✓ 已出席' : '☐ 点名签到'}
                    </button>
                  </td>
                  <td>
                    ${r.student_type === '非本院生' ? `
                      <button class="btn btn-sm ${r.converted_to_course ? 'btn-primary' : 'btn-secondary'}" onclick="App.updateRegistrationQuick('${r.id}', { converted_to_course: ${r.converted_to_course ? 'false' : 'true'} })">
                        ${r.converted_to_course ? '★ 已报读' : '未转化'}
                      </button>
                    ` : '<span style="color:var(--text-muted); font-size:12px;">本院在读</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async updateRegistrationQuick(regId, payload) {
    await this.api(`/api/registrations/${regId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    this.toast('学生报名/签到记录已实时保存');
    await this.openEvent(this.state.currentEventId, 'registrations');
  },

  async markRegistrationPaid(regId, fullAmount) {
    await this.api(`/api/registrations/${regId}`, {
      method: 'PUT',
      body: JSON.stringify({ paid_rm: fullAmount, receipt_no: `RCP-${Date.now().toString().slice(-6)}` })
    });
    this.toast('已收清报名费并同步更新活动实收财务数据');
    await this.openEvent(this.state.currentEventId, 'registrations');
  },

  openAddRegistrationModal() {
    const ev = this.state.currentEventData.event;
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:620px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:14px;">＋ 新增学生报名记录 (${this.esc(ev.name)})</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group"><label>学生名字 *</label><input type="text" class="form-control" id="nr-name" placeholder="例如：王小明 (ryan Wong)" /></div>
            <div class="form-group">
              <label>年级</label>
              <select class="form-control" id="nr-grade">
                ${['幼儿班', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '中学组'].map(g => `<option value="${g}" ${g === '三年级' ? 'selected' : ''}>${g}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>本院生或非本院生 *</label>
              <select class="form-control" id="nr-type">
                <option value="非本院生">非本院生 (自动生成阶段C跟进7步骤记录)</option>
                <option value="本院生">本院生</option>
              </select>
            </div>
            <div class="form-group">
              <label>报名来源</label>
              <select class="form-control" id="nr-source">
                <option value="Send Phonebank">Send Phonebank</option>
                <option value="Send 停补生">Send 停补生</option>
                <option value="本院兄弟姐妹">本院兄弟姐妹</option>
                <option value="小老板">小老板</option>
                <option value="本院家长Group">本院家长Group</option>
                <option value="FB / IG / 小红书">FB / IG / 小红书</option>
              </select>
            </div>
            <div class="form-group"><label>家长称呼</label><input type="text" class="form-control" id="nr-pname" placeholder="Mrs. Wong" /></div>
            <div class="form-group"><label>家长联系电话 (WhatsApp)</label><input type="text" class="form-control" id="nr-phone" placeholder="012-3456789" /></div>
            <div class="form-group">
              <label>付款方式</label>
              <select class="form-control" id="nr-method">
                <option value="TNG">TNG eWallet</option>
                <option value="Cash">Cash 现金</option>
                <option value="其他">银行转账 / 其他</option>
              </select>
            </div>
            <div class="form-group"><label>应付金额 (RM)</label><input type="number" class="form-control" id="nr-payable" value="${ev.fee_rm}" /></div>
            <div class="form-group"><label>实际已付金额 (RM) (填0则计为欠款)</label><input type="number" class="form-control" id="nr-paid" value="${ev.fee_rm}" /></div>
            <div class="form-group"><label>备注</label><input type="text" class="form-control" id="nr-notes" /></div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitAddRegistration()">保存报名记录</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitAddRegistration() {
    const student_name = document.getElementById('nr-name').value.trim();
    if (!student_name) return this.toast('请填写学生姓名', 'error');
    await this.api('/api/registrations', {
      method: 'POST',
      body: JSON.stringify({
        event_id: this.state.currentEventId,
        student_name,
        grade: document.getElementById('nr-grade').value,
        student_type: document.getElementById('nr-type').value,
        source: document.getElementById('nr-source').value,
        parent_name: document.getElementById('nr-pname').value,
        parent_phone: document.getElementById('nr-phone').value,
        payment_method: document.getElementById('nr-method').value,
        payable_rm: Number(document.getElementById('nr-payable').value),
        paid_rm: Number(document.getElementById('nr-paid').value),
        notes: document.getElementById('nr-notes').value
      })
    });
    this.closeModal();
    this.toast('学生报名记录已保存并同步财务数据');
    await this.openEvent(this.state.currentEventId, 'registrations');
  },

  openImportRegistrationsModal() {
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:600px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:10px;">📥 批量导入学生报名 CSV / Excel 数据</h3>
          <p style="font-size:13px; color:var(--text-secondary); margin-bottom:10px;">
            每行格式：<code>学生姓名,年级,本院生或非本院生,家长电话,来源,已付金额</code>
          </p>
          <textarea class="form-control" id="csv-import-text" rows="6" style="font-family:monospace; margin-bottom:14px;">刘小华,三年级,非本院生,012-8899001,Send Phonebank,35
郑美琪,四年级,非本院生,016-3344556,本院兄弟姐妹,35
苏子豪,二年级,本院生,017-6655443,本院家长Group,35</textarea>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitImportCsv()">立即解析并导入</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitImportCsv() {
    const raw = document.getElementById('csv-import-text').value.trim();
    if (!raw) return;
    const rows = raw.split('\n').map(line => {
      const cols = line.split(',').map(s => s.trim());
      return {
        student_name: cols[0],
        grade: cols[1] || '三年级',
        student_type: cols[2] || '非本院生',
        parent_phone: cols[3] || '',
        source: cols[4] || 'CSV批量导入',
        paid_rm: Number(cols[5]) || 0
      };
    });
    const res = await this.api('/api/registrations/import-csv', {
      method: 'POST',
      body: JSON.stringify({ event_id: this.state.currentEventId, rows })
    });
    this.closeModal();
    this.toast(`成功批量导入 ${res.importedCount} 名学生！`);
    await this.openEvent(this.state.currentEventId, 'registrations');
  },

  exportRegistrationsCsv() {
    const d = this.state.currentEventData;
    const regs = d.registrations || [];
    const headers = ['学生姓名', '年级', '分行', '类型', '家长联系方式', '报名来源', '状态', '付款方式', '应付RM', '已付RM', '欠款RM', '收据编号', '出席情况'];
    const lines = [
      headers.join(','),
      ...regs.map(r => [
        `"${r.student_name}"`, r.grade, r.branch, r.student_type, `"${r.parent_phone}"`,
        r.source, r.status, r.payment_method, r.payable_rm, r.paid_rm, r.balance_rm,
        r.receipt_no, r.attended ? '已出席' : '未出席'
      ].join(','))
    ];
    // Add UTF-8 BOM so Chinese characters never garble in Excel!
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${d.event.event_code}_${d.event.name}_报名与签到表.csv`;
    link.click();
    this.toast('已导出 Excel/CSV 报名签到表（含UTF-8防乱码BOM）');
  }
});


// ============================================================================
// PART 3: MARKETING SOURCES, STAGE C 7-STEP STUDENT FOLLOWUP, FINANCE, REVIEW, FILES, LOGS & GLOBAL MODULES
// ============================================================================

Object.assign(App, {
  // EVENT SUB-TAB 6: NON-CENTER SOURCES & LEVEL 1 / LEVEL 2 TARGETS & INDIVIDUAL 7-STEP FOLLOWUP (SECTION 10 & 4C)
  renderEventMarketingTab() {
    const container = document.getElementById('event-subtab-container');
    const d = this.state.currentEventData;
    const ev = d.event;
    const sources = d.marketingSources || [];
    const followUps = d.followUps || [];

    const totalReg = sources.reduce((s, x) => s + (x.registered_count || 0), 0);
    const totalAtt = sources.reduce((s, x) => s + (x.attended_count || 0), 0);
    const totalSuc = sources.reduce((s, x) => s + (x.success_count || 0), 0);

    const lvl1Actual = totalAtt;
    const lvl1Diff = lvl1Actual - (ev.level1_target || 0);
    const lvl2Actual = totalSuc;
    const lvl2Diff = lvl2Actual - (ev.level2_target || 0);

    const stepShortNames = [
      'Step 1: 感谢参加&邀友福利',
      'Step 2: 了解IG/兴趣/学校表现',
      'Step 3: Sharing教材(Lesson Plan/Busy Bag/T-UP)',
      'Step 4: 了解学习情况邀约复习',
      'Step 5: 询问本院课程时间鼓励一起来',
      'Step 6: 科目时间/现场安排/温馨提醒',
      'Step 7: Post Group 报告'
    ];

    container.innerHTML = `
      <!-- Original Counter SOP Non-Center Targets: Level 1 & Level 2 -->
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">🎯 原版 Counter SOP「非本院目标」达成追踪 (Level 1 &amp; Level 2)</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">Level 1、Level 2 的名称、定义及目标数量允许主管随时修改；系统自动计算目标与实际差距，避免重复计算同一学生。</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="App.openEditTargetsModal()">⚙️ 修改 Level 1 / Level 2 定义与目标</button>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
          <div style="border:1px solid var(--border-color); border-left:5px solid #1D4ED8; border-radius:8px; padding:16px; background:#F8FAFC;">
            <div style="font-weight:800; font-size:16px; color:#1D4ED8;">${this.esc(ev.level1_name)}</div>
            <div style="font-size:12.5px; color:var(--text-secondary); margin-bottom:10px;">统计定义：${this.esc(ev.level1_definition)}</div>
            <div style="display:flex; justify-content:space-between; font-size:15px;">
              <span>目标数量：<strong>${ev.level1_target} 人</strong></span>
              <span>实际结果：<strong>${lvl1Actual} 人</strong></span>
              <span style="color:${lvl1Diff >= 0 ? '#15803D' : '#DC2626'}; font-weight:800;">
                差距：${lvl1Diff >= 0 ? `+${lvl1Diff} (达标)` : `${lvl1Diff} (尚差 ${Math.abs(lvl1Diff)} 人)`}
              </span>
            </div>
          </div>

          <div style="border:1px solid var(--border-color); border-left:5px solid var(--brand-red); border-radius:8px; padding:16px; background:#FEF2F2;">
            <div style="font-weight:800; font-size:16px; color:var(--brand-red);">${this.esc(ev.level2_name)}</div>
            <div style="font-size:12.5px; color:var(--text-secondary); margin-bottom:10px;">统计定义：${this.esc(ev.level2_definition)}</div>
            <div style="display:flex; justify-content:space-between; font-size:15px;">
              <span>目标数量：<strong>${ev.level2_target} 人</strong></span>
              <span>实际结果：<strong>${lvl2Actual} 人</strong></span>
              <span style="color:${lvl2Diff >= 0 ? '#15803D' : '#DC2626'}; font-weight:800;">
                差距：${lvl2Diff >= 0 ? `+${lvl2Diff} (达标)` : `${lvl2Diff} (尚差 ${Math.abs(lvl2Diff)} 人)`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 4 Default Non-Center Marketing Sources Table -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📣 非本院招生来源统计表 (默认4大Counter SOP渠道 + 自定义来源)</div>
          <button class="btn btn-primary btn-sm" onclick="App.openAddMarketingSourceModal()">＋ 新增其他招生来源</button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>非本院来源渠道</th>
                <th>存库/名单数</th>
                <th>已联系数</th>
                <th>已回应数</th>
                <th>已报名数</th>
                <th>实际出席数</th>
                <th>成功转化数</th>
                <th>转化率</th>
                <th>负责老师</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${sources.map(ms => `
                <tr>
                  <td style="font-weight:800;">${this.esc(ms.source_name)}</td>
                  <td><input type="number" class="form-control" style="width:72px; padding:4px;" value="${ms.database_count}" onchange="App.updateMarketingSource('${ms.id}', { database_count: this.value })" /></td>
                  <td><input type="number" class="form-control" style="width:72px; padding:4px;" value="${ms.contacted_count}" onchange="App.updateMarketingSource('${ms.id}', { contacted_count: this.value })" /></td>
                  <td><input type="number" class="form-control" style="width:72px; padding:4px;" value="${ms.responded_count}" onchange="App.updateMarketingSource('${ms.id}', { responded_count: this.value })" /></td>
                  <td><input type="number" class="form-control" style="width:72px; padding:4px;" value="${ms.registered_count}" onchange="App.updateMarketingSource('${ms.id}', { registered_count: this.value })" /></td>
                  <td><input type="number" class="form-control" style="width:72px; padding:4px;" value="${ms.attended_count}" onchange="App.updateMarketingSource('${ms.id}', { attended_count: this.value })" /></td>
                  <td><input type="number" class="form-control" style="width:72px; padding:4px;" value="${ms.success_count}" onchange="App.updateMarketingSource('${ms.id}', { success_count: this.value })" /></td>
                  <td style="font-weight:800; color:var(--brand-red);">${ms.conversion_rate}%</td>
                  <td>${this.esc(ms.assignee_name)}</td>
                  <td><span style="font-size:12px; color:var(--text-muted);">自动保存</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Individual Student / Parent 7-Step Follow-up Tracker -->
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">🤝 阶段 C：非本院学生／家长一对一跟进7步骤记录 (受权限保护)</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">每位非本院学生独立追踪7个转化步骤、设定活动后第几天完成、保存家长反馈与WhatsApp沟通备注。</div>
          </div>
        </div>

        ${followUps.length === 0 ? `<p style="padding:14px; color:var(--text-muted);">暂无非本院生跟进记录（新增非本院生报名时将自动生成）。</p>` : `
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${followUps.map(f => {
              const steps = f.steps_completed || [false, false, false, false, false, false, false];
              return `
                <div style="border:1px solid var(--border-color); border-radius:8px; padding:14px; background:#FFFFFF;">
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <div>
                      <strong style="font-size:16px;">🎓 ${this.esc(f.student_name)}</strong>
                      <span style="font-size:12.5px; color:var(--text-secondary); margin-left:8px;">📞 家长：${this.esc(f.parent_phone)} ｜ 负责跟进老师：<strong>${this.esc(f.assignee_name)}</strong></span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                      <select class="form-control" style="padding:3px 8px; font-size:12.5px; width:auto;" onchange="App.updateFollowUp('${f.id}', { contact_status: this.value })">
                        ${['已联络', '未回复', '需再次联络', '未联络'].map(cs => `<option value="${cs}" ${f.contact_status === cs ? 'selected' : ''}>状态: ${cs}</option>`).join('')}
                      </select>
                      <select class="form-control" style="padding:3px 8px; font-size:12.5px; width:auto; font-weight:700;" onchange="App.updateFollowUp('${f.id}', { followup_result: this.value })">
                        ${['跟进中', '已预约体验课', '已成功报读', '暂不考虑'].map(rs => `<option value="${rs}" ${f.followup_result === rs ? 'selected' : ''}>结果: ${rs}</option>`).join('')}
                      </select>
                    </div>
                  </div>

                  <!-- 7 Steps Independent Checkboxes -->
                  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:6px; margin-bottom:10px;">
                    ${stepShortNames.map((sname, sIdx) => `
                      <label style="display:flex; align-items:center; gap:6px; font-size:12px; padding:5px 8px; border-radius:5px; border:1px solid ${steps[sIdx] ? '#86EFAC' : '#CBD5E1'}; background:${steps[sIdx] ? '#DCFCE7' : '#F8FAFC'}; color:${steps[sIdx] ? '#15803D' : '#334155'}; cursor:pointer;">
                        <input type="checkbox" ${steps[sIdx] ? 'checked' : ''} onchange="App.toggleFollowUpStep('${f.id}', ${sIdx}, this.checked)" />
                        <span>${this.esc(sname)}</span>
                      </label>
                    `).join('')}
                  </div>

                  <div style="font-size:12.5px; color:var(--text-secondary); background:var(--bg-subtle); padding:8px 12px; border-radius:6px;">
                    <div>💬 <strong>家长反馈：</strong> ${this.esc(f.parent_feedback || '暂无')} ｜ 📅 <strong>下次跟进：</strong> ${this.esc(f.next_followup_date || '未定')} (活动后第 ${f.days_after_event} 天)</div>
                    <div style="margin-top:3px;">📱 <strong>WhatsApp 沟通备注：</strong> ${this.esc(f.whatsapp_notes || '暂无')}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  },

  async updateMarketingSource(id, payload) {
    await this.api(`/api/marketing-sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    this.toast('非本院来源数据与转化率已自动重算');
    await this.openEvent(this.state.currentEventId, 'marketing');
  },

  async toggleFollowUpStep(followUpId, stepIndex, isChecked) {
    const f = this.state.currentEventData.followUps.find(x => x.id === followUpId);
    if (!f) return;
    const steps = [...(f.steps_completed || [false, false, false, false, false, false, false])];
    steps[stepIndex] = isChecked;
    await this.api(`/api/follow-ups/${followUpId}`, {
      method: 'PUT',
      body: JSON.stringify({ steps_completed: steps, step_number: stepIndex + 1 })
    });
    this.toast(`学生 ${f.student_name} 的 Step ${stepIndex + 1} 已更新保存`);
    await this.openEvent(this.state.currentEventId, 'marketing');
  },

  async updateFollowUp(followUpId, payload) {
    await this.api(`/api/follow-ups/${followUpId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    this.toast('跟进状态已保存');
    await this.openEvent(this.state.currentEventId, 'marketing');
  },

  openEditTargetsModal() {
    const ev = this.state.currentEventData.event;
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:540px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:12px;">⚙️ 修改非本院目标 Level 1 &amp; Level 2 定义</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group"><label>Level 1 名称</label><input type="text" class="form-control" id="tg-l1-name" value="${this.esc(ev.level1_name)}" /></div>
            <div class="form-group"><label>Level 1 目标人数</label><input type="number" class="form-control" id="tg-l1-target" value="${ev.level1_target}" /></div>
            <div class="form-group" style="grid-column:1 / -1;"><label>Level 1 统计定义</label><input type="text" class="form-control" id="tg-l1-def" value="${this.esc(ev.level1_definition)}" /></div>
            <div class="form-group"><label>Level 2 名称</label><input type="text" class="form-control" id="tg-l2-name" value="${this.esc(ev.level2_name)}" /></div>
            <div class="form-group"><label>Level 2 目标人数</label><input type="number" class="form-control" id="tg-l2-target" value="${ev.level2_target}" /></div>
            <div class="form-group" style="grid-column:1 / -1;"><label>Level 2 统计定义</label><input type="text" class="form-control" id="tg-l2-def" value="${this.esc(ev.level2_definition)}" /></div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitEditTargets()">保存目标设置</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitEditTargets() {
    await this.api(`/api/events/${this.state.currentEventId}`, {
      method: 'PUT',
      body: JSON.stringify({
        level1_name: document.getElementById('tg-l1-name').value,
        level1_target: Number(document.getElementById('tg-l1-target').value),
        level1_definition: document.getElementById('tg-l1-def').value,
        level2_name: document.getElementById('tg-l2-name').value,
        level2_target: Number(document.getElementById('tg-l2-target').value),
        level2_definition: document.getElementById('tg-l2-def').value
      })
    });
    this.closeModal();
    this.toast('Level 1 & Level 2 目标已更新');
    await this.openEvent(this.state.currentEventId, 'marketing');
  },

  openAddMarketingSourceModal() {
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:480px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:12px;">＋ 新增非本院推广来源渠道</h3>
          <div class="form-group" style="margin-bottom:12px;">
            <label>来源名称 *</label>
            <input type="text" class="form-control" id="nms-name" placeholder="例如：小红书同城推广 / 校门口派传单" />
          </div>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group"><label>名单数量</label><input type="number" class="form-control" id="nms-db" value="50" /></div>
            <div class="form-group"><label>已报名数量</label><input type="number" class="form-control" id="nms-reg" value="5" /></div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitAddMarketingSource()">新增来源</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitAddMarketingSource() {
    const source_name = document.getElementById('nms-name').value.trim();
    if (!source_name) return;
    await this.api('/api/marketing-sources', {
      method: 'POST',
      body: JSON.stringify({
        event_id: this.state.currentEventId,
        source_name,
        database_count: Number(document.getElementById('nms-db').value),
        registered_count: Number(document.getElementById('nms-reg').value)
      })
    });
    this.closeModal();
    await this.openEvent(this.state.currentEventId, 'marketing');
  },

  // ============================================================================
  // EVENT SUB-TAB 7: BUDGET & FINANCIAL STATEMENT (SECTION 11)
  // ============================================================================
  renderEventFinanceTab() {
    const container = document.getElementById('event-subtab-container');
    const d = this.state.currentEventData;
    const ev = d.event;
    const s = d.summary;

    if (!d.permissions.can_view_finance) {
      container.innerHTML = `
        <div class="card">
          <div class="alert-box alert-warning" style="margin-bottom:0;">
            <div>🔒 <strong>财务权限保护：</strong> 您当前的账号角色（${this.esc(this.state.currentUser?.name)}）未被授予查看敏感活动财务与收支结余权限。如需查看请联系 Admin／院长 开启授权。</div>
          </div>
        </div>
      `;
      return;
    }

    const b = d.budget || {};
    const exps = d.expenses || [];
    const totalBudget =
      (Number(b.material_budget_rm) || 0) +
      (Number(b.transport_budget_rm) || 0) +
      (Number(b.venue_budget_rm) || 0) +
      (Number(b.catering_budget_rm) || 0) +
      (Number(b.prize_budget_rm) || 0) +
      (Number(b.marketing_budget_rm) || 0) +
      (Number(b.other_budget_rm) || 0);

    const budgetVariance = totalBudget - s.actualTotalCost;
    const avgStudentCost = s.actualTotalCost / (ev.actual_students > 0 ? ev.actual_students : (ev.expected_students || 1));

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">预计报名收入 vs 实际已收收入</div>
          <div class="kpi-value" style="color:#15803D;">RM ${s.totalPaidIncome.toFixed(2)}</div>
          <div class="kpi-sub">预计收入: RM ${(ev.expected_students * ev.fee_rm).toFixed(2)} (未付款不计入实收)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">预算总额 vs 实际总成本</div>
          <div class="kpi-value" style="color:var(--brand-red);">RM ${s.actualTotalCost.toFixed(2)}</div>
          <div class="kpi-sub">分类预算总额: RM ${totalBudget.toFixed(2)} | 差额: RM ${budgetVariance.toFixed(2)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">每位学生平均成本</div>
          <div class="kpi-value">RM ${avgStudentCost.toFixed(2)}</div>
          <div class="kpi-sub">含材料 + 场地 + 餐饮 + 奖品 + 宣传</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">本场活动收支结余 (独立核算)</div>
          <div class="kpi-value" style="color:${s.netBalanceRm >= 0 ? '#15803D' : '#DC2626'};">
            RM ${s.netBalanceRm.toFixed(2)}
          </div>
          <div class="kpi-sub">${s.netBalanceRm >= 0 ? '✓ 活动收支盈余' : '⚠️ 成本大于已收报名费'}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">💰 活动分类预算与实际成本对照表 (每场活动独立账本，绝不混账)</div>
          <button class="btn btn-primary btn-sm" onclick="App.openAddExpenseModal()">＋ 录入新费用开支 / 上传收据</button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>费用科目</th>
                <th>预算金额 (RM)</th>
                <th>实际发生金额 (RM)</th>
                <th>预算差额 (RM)</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight:700;">1. 材料成本 (自动汇总自材料清单)</td>
                <td>RM ${Number(b.material_budget_rm || 0).toFixed(2)}</td>
                <td style="font-weight:700; color:var(--brand-red);">RM ${Number(s.totalMaterialCost).toFixed(2)}</td>
                <td>RM ${(Number(b.material_budget_rm || 0) - s.totalMaterialCost).toFixed(2)}</td>
                <td>与活动材料采购模块实时联动</td>
              </tr>
              <tr>
                <td style="font-weight:700;">2. 运输费用</td>
                <td>RM ${Number(b.transport_budget_rm || 0).toFixed(2)}</td>
                <td>RM ${Number(b.actual_transport_rm || 0).toFixed(2)}</td>
                <td>RM ${(Number(b.transport_budget_rm || 0) - Number(b.actual_transport_rm || 0)).toFixed(2)}</td>
                <td>物流、空运及车马费</td>
              </tr>
              <tr>
                <td style="font-weight:700;">3. 场地费用</td>
                <td>RM ${Number(b.venue_budget_rm || 0).toFixed(2)}</td>
                <td>RM ${Number(b.actual_venue_rm || 0).toFixed(2)}</td>
                <td>RM ${(Number(b.venue_budget_rm || 0) - Number(b.actual_venue_rm || 0)).toFixed(2)}</td>
                <td>场地布置、冷气及设备租赁</td>
              </tr>
              <tr>
                <td style="font-weight:700;">4. 餐饮费用</td>
                <td>RM ${Number(b.catering_budget_rm || 0).toFixed(2)}</td>
                <td>RM ${Number(b.actual_catering_rm || 0).toFixed(2)}</td>
                <td>RM ${(Number(b.catering_budget_rm || 0) - Number(b.actual_catering_rm || 0)).toFixed(2)}</td>
                <td>学生茶点、老师工作餐</td>
              </tr>
              <tr>
                <td style="font-weight:700;">5. 奖品费用</td>
                <td>RM ${Number(b.prize_budget_rm || 0).toFixed(2)}</td>
                <td>RM ${Number(b.actual_prize_rm || 0).toFixed(2)}</td>
                <td>RM ${(Number(b.prize_budget_rm || 0) - Number(b.actual_prize_rm || 0)).toFixed(2)}</td>
                <td>用心小礼物、奖状、奖杯</td>
              </tr>
              <tr>
                <td style="font-weight:700;">6. 宣传费用</td>
                <td>RM ${Number(b.marketing_budget_rm || 0).toFixed(2)}</td>
                <td>RM ${Number(b.actual_marketing_rm || 0).toFixed(2)}</td>
                <td>RM ${(Number(b.marketing_budget_rm || 0) - Number(b.actual_marketing_rm || 0)).toFixed(2)}</td>
                <td>海报传单印刷、布条、FB广告</td>
              </tr>
              <tr>
                <td style="font-weight:700;">7. 其他开支</td>
                <td>RM ${Number(b.other_budget_rm || 0).toFixed(2)}</td>
                <td>RM ${Number(b.actual_other_rm || 0).toFixed(2)}</td>
                <td>RM ${(Number(b.other_budget_rm || 0) - Number(b.actual_other_rm || 0)).toFixed(2)}</td>
                <td>备用金及杂项</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">🧾 费用支出明细与收据记录</div>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>分类</th>
                <th>支出项目说明</th>
                <th>金额 (RM)</th>
                <th>经手人</th>
                <th>收据凭证</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              ${exps.map(ex => `
                <tr>
                  <td>${this.esc(ex.expense_date)}</td>
                  <td><span class="status-pill status-pending">${this.esc(ex.category)}</span></td>
                  <td style="font-weight:700;">${this.esc(ex.title)}</td>
                  <td style="font-weight:800; color:var(--brand-red);">RM ${Number(ex.amount_rm).toFixed(2)}</td>
                  <td>${this.esc(ex.paid_by)}</td>
                  <td><a href="/assets/sample-receipt.svg" target="_blank" style="color:var(--brand-red); font-weight:600;">📄 ${this.esc(ex.receipt_name || '查看收据')}</a></td>
                  <td><span class="status-pill status-completed">${this.esc(ex.status)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openAddExpenseModal() {
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:520px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:14px;">＋ 录入活动费用开支 &amp; 收据</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group">
              <label>费用分类 *</label>
              <select class="form-control" id="ne-cat">
                <option value="宣传费用">宣传费用</option>
                <option value="运输费用">运输费用</option>
                <option value="场地费用">场地费用</option>
                <option value="餐饮费用">餐饮费用</option>
                <option value="奖品费用">奖品费用</option>
                <option value="其他开支">其他开支</option>
              </select>
            </div>
            <div class="form-group"><label>金额 (RM) *</label><input type="number" step="0.01" class="form-control" id="ne-amt" value="80" /></div>
            <div class="form-group" style="grid-column:1 / -1;"><label>开支项目说明 *</label><input type="text" class="form-control" id="ne-title" placeholder="例如：加印200张小老板邀友券" /></div>
            <div class="form-group"><label>支出日期</label><input type="date" class="form-control" id="ne-date" value="2026-11-18" /></div>
            <div class="form-group"><label>收据文件名称</label><input type="text" class="form-control" id="ne-receipt" placeholder="Receipt_20261118.jpg" /></div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitAddExpense()">保存开支并重算结余</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitAddExpense() {
    const title = document.getElementById('ne-title').value.trim();
    if (!title) return this.toast('请填写支出项目说明', 'error');
    await this.api('/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        event_id: this.state.currentEventId,
        category: document.getElementById('ne-cat').value,
        amount_rm: Number(document.getElementById('ne-amt').value),
        title,
        expense_date: document.getElementById('ne-date').value,
        receipt_name: document.getElementById('ne-receipt').value || 'Receipt.pdf'
      })
    });
    this.closeModal();
    this.toast('费用支出已入账并更新活动收支结余');
    await this.openEvent(this.state.currentEventId, 'finance');
  },

  // ============================================================================
  // EVENT SUB-TAB 8: POST-EVENT SUMMARY & REVIEW REPORT (SECTION 13)
  // ============================================================================
  renderEventReviewTab() {
    const container = document.getElementById('event-subtab-container');
    const d = this.state.currentEventData;
    const ev = d.event;
    const s = d.summary;
    const r = d.review || {};
    const refs = d.referenceReviews || [];

    container.innerHTML = `
      ${refs.length > 0 ? `
        <div class="alert-box alert-success">
          <div>
            <strong>💡 往期同类型活动（「${this.esc(ev.category)}」）复盘经验参考：</strong><br/>
            来自《${this.esc(refs[0].event_name)} (${this.esc(refs[0].event_code)})》的改进建议：${this.esc(refs[0].improvements_next_time)}
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">📝 活动总结与复盘报告 (Event Post-Mortem &amp; Archive)</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">评分需真实填写，不凭空生成；保存后可作为下次同类型活动的参考建议。</div>
          </div>
        </div>

        <!-- Auto-compiled Event Basic Performance -->
        <div style="background:var(--bg-subtle); padding:14px; border-radius:8px; margin-bottom:18px; display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; font-size:13px;">
          <div>预计人数：<strong>${ev.expected_students} 人</strong></div>
          <div>报名人数：<strong>${s.activeRegistrations} 人</strong></div>
          <div>实际出席：<strong>${s.attendedCount} 人</strong></div>
          <div>非本院生：<strong>${s.externalReg} 人</strong></div>
          <div>实际收入：<strong>RM ${s.totalPaidIncome.toFixed(2)}</strong></div>
          <div>实际总成本：<strong>RM ${s.actualTotalCost.toFixed(2)}</strong></div>
          <div>收支结余：<strong>RM ${s.netBalanceRm.toFixed(2)}</strong></div>
          <div>SOP完成率：<strong>${s.completionPct}%</strong></div>
          <div>延误任务数：<strong>${s.overdueItems} 项</strong></div>
        </div>

        <div class="form-grid" style="margin-bottom:16px;">
          <div class="form-group"><label>1. 这次活动哪里做得好？</label><textarea class="form-control" id="rv-well" rows="2">${this.esc(r.what_went_well || '')}</textarea></div>
          <div class="form-group"><label>2. 遇到什么问题？</label><textarea class="form-control" id="rv-prob" rows="2">${this.esc(r.problems_encountered || '')}</textarea></div>
          <div class="form-group"><label>3. 哪些材料不够？</label><textarea class="form-control" id="rv-short" rows="2">${this.esc(r.materials_shortage || '')}</textarea></div>
          <div class="form-group"><label>4. 哪些材料买太多？</label><textarea class="form-control" id="rv-excess" rows="2">${this.esc(r.materials_excess || '')}</textarea></div>
          <div class="form-group"><label>5. 哪些宣传渠道最有效？</label><textarea class="form-control" id="rv-chan" rows="2">${this.esc(r.effective_channels || '')}</textarea></div>
          <div class="form-group"><label>6. 哪些安排不够顺畅？</label><textarea class="form-control" id="rv-unsmooth" rows="2">${this.esc(r.unsmooth_arrangements || '')}</textarea></div>
          <div class="form-group"><label>7. 家长反馈是什么？</label><textarea class="form-control" id="rv-parent" rows="2">${this.esc(r.parent_feedback_summary || '')}</textarea></div>
          <div class="form-group"><label>8. 学生反馈是什么？</label><textarea class="form-control" id="rv-student" rows="2">${this.esc(r.student_feedback_summary || '')}</textarea></div>
          <div class="form-group" style="grid-column:1 / -1;"><label>9. 下次可以怎么改进？（将保存为下次同类型活动的智能参考建议）</label><textarea class="form-control" id="rv-imp" rows="2">${this.esc(r.improvements_next_time || '')}</textarea></div>
        </div>

        <div style="border-top:1px solid var(--border-color); padding-top:14px; margin-bottom:18px;">
          <div style="font-weight:800; margin-bottom:10px;">⭐ 活动7维度真实评分 (1-5分，0表示暂未评分)</div>
          <div class="form-grid">
            ${[
              { id: 'rv-s1', label: '筹备效率', val: r.score_prep_efficiency || 0 },
              { id: 'rv-s2', label: '老师执行', val: r.score_teacher_execution || 0 },
              { id: 'rv-s3', label: '学生参与', val: r.score_student_participation || 0 },
              { id: 'rv-s4', label: '家长反馈', val: r.score_parent_feedback || 0 },
              { id: 'rv-s5', label: '材料准备', val: r.score_material_prep || 0 },
              { id: 'rv-s6', label: '预算控制', val: r.score_budget_control || 0 },
              { id: 'rv-s7', label: '活动整体效果', val: r.score_overall_effect || 0 }
            ].map(sc => `
              <div class="form-group">
                <label>${sc.label}</label>
                <select class="form-control" id="${sc.id}">
                  <option value="0" ${sc.val === 0 ? 'selected' : ''}>未评分 (0)</option>
                  <option value="5" ${sc.val === 5 ? 'selected' : ''}>5分 - 非常优秀</option>
                  <option value="4" ${sc.val === 4 ? 'selected' : ''}>4分 - 良好</option>
                  <option value="3" ${sc.val === 3 ? 'selected' : ''}>3分 - 合格</option>
                  <option value="2" ${sc.val === 2 ? 'selected' : ''}>2分 - 需改进</option>
                  <option value="1" ${sc.val === 1 ? 'selected' : ''}>1分 - 严重不足</option>
                </select>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn btn-secondary" onclick="App.submitEventReview(false)">💾 保存复盘报告</button>
          <button class="btn btn-primary" onclick="App.submitEventReview(true)">🗂️ 保存复盘并将活动正式归档 (永久保留历史)</button>
        </div>
      </div>
    `;
  },

  async submitEventReview(archiveEvent = false) {
    await this.api(`/api/events/${this.state.currentEventId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        what_went_well: document.getElementById('rv-well').value,
        problems_encountered: document.getElementById('rv-prob').value,
        materials_shortage: document.getElementById('rv-short').value,
        materials_excess: document.getElementById('rv-excess').value,
        effective_channels: document.getElementById('rv-chan').value,
        unsmooth_arrangements: document.getElementById('rv-unsmooth').value,
        parent_feedback_summary: document.getElementById('rv-parent').value,
        student_feedback_summary: document.getElementById('rv-student').value,
        improvements_next_time: document.getElementById('rv-imp').value,
        score_prep_efficiency: Number(document.getElementById('rv-s1').value),
        score_teacher_execution: Number(document.getElementById('rv-s2').value),
        score_student_participation: Number(document.getElementById('rv-s3').value),
        score_parent_feedback: Number(document.getElementById('rv-s4').value),
        score_material_prep: Number(document.getElementById('rv-s5').value),
        score_budget_control: Number(document.getElementById('rv-s6').value),
        score_overall_effect: Number(document.getElementById('rv-s7').value),
        save_as_reference: true,
        archive_event: archiveEvent
      })
    });
    this.toast(archiveEvent ? '活动复盘已保存并归档！历史档案永久可查。' : '活动复盘报告已保存');
    await this.openEvent(this.state.currentEventId, 'review');
  },

  // ============================================================================
  // EVENT SUB-TAB 9: FILE & ASSET CENTER (SECTION 14)
  // ============================================================================
  renderEventFilesTab() {
    const container = document.getElementById('event-subtab-container');
    const atts = this.state.currentEventData.attachments || [];

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">📂 活动文件与素材中心 (海报/视频/照片/收据/Excel/Google Drive链接)</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">活动归档后所有素材仍可随时访问与下载，严格记录原始文件名称、上传者及上传日期。</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="App.openAddAttachmentModal()">＋ 上传文件 / 添加云端链接</button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>分类</th>
                <th>原始文件名称 / 链接标题</th>
                <th>大小/类型</th>
                <th>上传者</th>
                <th>上传时间</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${atts.map(a => `
                <tr>
                  <td><span class="status-pill status-progress">${this.esc(a.category)}</span></td>
                  <td style="font-weight:700;">
                    <a href="${this.esc(a.file_url)}" target="_blank" style="color:var(--brand-red);">${this.esc(a.original_name)}</a>
                  </td>
                  <td>${this.esc(a.file_size || a.file_type)}</td>
                  <td>${this.esc(a.uploaded_by_name)}</td>
                  <td>${this.esc(a.uploaded_at)}</td>
                  <td>${this.esc(a.notes)}</td>
                  <td>
                    <a class="btn btn-secondary btn-sm" href="${this.esc(a.file_url)}" target="_blank">预览/下载</a>
                    <button class="btn btn-danger btn-sm" onclick="App.deleteAttachment('${a.id}')">删除</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openAddAttachmentModal() {
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:520px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:14px;">＋ 上传活动文件或添加素材链接</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group">
              <label>文件分类</label>
              <select class="form-control" id="na-cat">
                ${['活动海报', '宣传视频', '活动照片', '材料照片', '收据', 'Excel表格', 'PDF', 'Word', 'PPT', 'Google Drive链接', '购买链接', '其他附件'].map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>原始文件名称 *</label><input type="text" class="form-control" id="na-name" placeholder="例如：圣诞派对_宣传海报终稿.png" /></div>
            <div class="form-group" style="grid-column:1 / -1;"><label>文件URL或Google Drive/购买链接</label><input type="text" class="form-control" id="na-url" value="/assets/sample-poster.svg" /></div>
            <div class="form-group" style="grid-column:1 / -1;"><label>备注说明</label><input type="text" class="form-control" id="na-notes" /></div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitAddAttachment()">确认上传保存</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitAddAttachment() {
    const original_name = document.getElementById('na-name').value.trim();
    if (!original_name) return this.toast('请填写文件名称', 'error');
    await this.api('/api/attachments', {
      method: 'POST',
      body: JSON.stringify({
        event_id: this.state.currentEventId,
        category: document.getElementById('na-cat').value,
        original_name,
        file_url: document.getElementById('na-url').value,
        notes: document.getElementById('na-notes').value
      })
    });
    this.closeModal();
    this.toast('文件素材已保存');
    await this.openEvent(this.state.currentEventId, 'files');
  },

  async deleteAttachment(id) {
    await this.api(`/api/attachments/${id}`, { method: 'DELETE' });
    this.toast('素材已删除');
    await this.openEvent(this.state.currentEventId, 'files');
  },

  // ============================================================================
  // EVENT SUB-TAB 10: APPROVAL & EXECUTION AUDIT LOGS
  // ============================================================================
  renderEventLogsTab() {
    const container = document.getElementById('event-subtab-container');
    const logs = this.state.currentEventData.executionLogs || [];
    const approvals = this.state.currentEventData.approvals || [];

    container.innerHTML = `
      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">🛡️ 主管二层审核确认记录 (${approvals.length})</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>审核时间</th>
                <th>审核主管/院长</th>
                <th>审核决定</th>
                <th>退回原因 / 审核意见</th>
              </tr>
            </thead>
            <tbody>
              ${approvals.length === 0 ? `<tr><td colspan="4" style="color:var(--text-muted);">暂无审核记录</td></tr>` : approvals.map(a => `
                <tr>
                  <td>${this.esc(a.created_at)}</td>
                  <td style="font-weight:700;">${this.esc(a.reviewer_name)}</td>
                  <td>${this.approvalBadge(a.decision)}</td>
                  <td>${this.esc(a.reason || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">📜 Ticklist 状态变更与操作轨迹日志 (${logs.length})</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>操作时间</th>
                <th>操作人员</th>
                <th>动作</th>
                <th>状态变化</th>
                <th>详细说明</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td>${this.esc(l.created_at)}</td>
                  <td style="font-weight:700;">${this.esc(l.user_name)}</td>
                  <td>${this.esc(l.action)}</td>
                  <td>${this.esc(l.previous_status)} → <strong>${this.esc(l.new_status)}</strong></td>
                  <td>${this.esc(l.details)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ============================================================================
  // SECTION 17: A4 PRINT & PDF / EXCEL EXPORT CENTER (7 REQUIRED FORMATS)
  // ============================================================================
  openPrintCenterModal() {
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:680px;">
          <h3 style="font-size:19px; font-weight:800; margin-bottom:10px;">🖨️ A4 纸本打印与 PDF / Excel 导出中心 (Section 17)</h3>
          <p style="font-size:13.5px; color:var(--text-secondary); margin-bottom:14px;">
            系统支持将数字化 SOP 打印为清晰的 A4 纸本表格，包含活动名称、日期、负责人、审核人及各项勾选情况，支持选择「只打印未完成项目」。
          </p>

          <div style="margin-bottom:14px; padding:10px 14px; background:var(--bg-subtle); border-radius:6px;">
            <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer;">
              <input type="checkbox" id="print-only-unfinished-chk" ${this.state.tickOnlyUnfinished ? 'checked' : ''} />
              <span>打印 A4 Ticklist 时只打印「未完成项目」</span>
            </label>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:18px;">
            <button class="btn btn-primary" onclick="App.printA4Document('ticklist')">🖨️ 1. 打印 A4 活动总 Ticklist</button>
            <button class="btn btn-secondary" onclick="App.printA4Document('tasks')">🖨️ 2. 打印 A4 老师任务分配表</button>
            <button class="btn btn-secondary" onclick="App.printA4Document('materials')">🖨️ 3. 打印 活动材料采购清单</button>
            <button class="btn btn-secondary" onclick="App.printA4Document('schedule')">🖨️ 4. 打印 活动当天流程表</button>
            <button class="btn btn-secondary" onclick="App.printA4Document('registrations')">🖨️ 5. 打印 学生报名与签到表</button>
            <button class="btn btn-secondary" onclick="App.printA4Document('finance')">🖨️ 6. 打印 活动财务报告</button>
            <button class="btn btn-secondary" onclick="App.printA4Document('review')">🖨️ 7. 打印 活动完整总结报告</button>
            <button class="btn btn-success" onclick="App.exportEventFullExcelCsv()">📊 导出完整 Excel / CSV 数据包 (防乱码)</button>
          </div>

          <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-secondary" onclick="App.closeModal()">关闭</button>
          </div>
        </div>
      </div>
    `;
  },

  printA4Document(docType) {
    const onlyUnfinished = document.getElementById('print-only-unfinished-chk')?.checked || false;
    this.state.tickOnlyUnfinished = onlyUnfinished;
    this.closeModal();
    this.switchEventTab(docType);
    setTimeout(() => {
      window.print();
    }, 250);
  },

  exportEventFullExcelCsv() {
    const d = this.state.currentEventData;
    const ev = d.event;
    const items = d.checklistItems || [];
    const headers = ['阶段', '序号', '检查项名称', '分类', '负责老师', '截止日期', '执行状态', '是否已打勾', '完成日期', '完成时间', '审核状态', '审核人', '备注'];
    const lines = [
      `"5+1 活动管理系统 - ${ev.name} (${ev.event_code}) 完整 SOP Ticklist 导出表"`,
      `"举行日期: ${ev.start_date}","地点: ${ev.location}","负责人: ${ev.leader_name}","活动状态: ${ev.status}"`,
      '',
      headers.join(','),
      ...items.map(i => [
        `阶段${i.stage}`, i.sort_order, `"${i.title}"`, i.category_tag, `"${i.assignee_name}"`,
        i.due_date, i.status, i.is_checked ? '☑已完成' : '☐未完成',
        i.completed_date, i.completed_time, i.approval_status, `"${i.reviewer_name}"`, `"${(i.notes || '').replace(/"/g, '""')}"`
      ].join(','))
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${ev.event_code}_${ev.name}_完整SOP与任务表.csv`;
    link.click();
    this.closeModal();
    this.toast('成功导出完整 SOP Ticklist Excel/CSV 报表（中文无乱码）');
  }
});


// ============================================================================
// PART 4: GLOBAL NAVIGATION MODULES (CALENDAR, MY TASKS, INVENTORY, FINANCE, REGISTRATIONS, ARCHIVES, ANALYTICS, TEMPLATES, USERS, SETTINGS)
// ============================================================================

Object.assign(App, {
  // 3. CALENDAR VIEW (Month / Week / List / Year Views - Section 12.1)
  renderCalendarView() {
    const main = document.getElementById('app-main-view');
    const year = this.state.calendarYear;
    const month = this.state.calendarMonth;
    const mode = this.state.calendarViewMode;
    const events = this.state.events || [];

    const monthEvents = events.filter(e => Number(e.year) === Number(year) && Number(e.month) === Number(month));
    const yearEvents = events.filter(e => Number(e.year) === Number(year));

    // Build Month Grid
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span class="card-title">📅 5+1 活动日历与年度排期</span>
            <select class="form-control" style="width:auto; font-weight:700;" onchange="App.state.calendarYear=Number(this.value); App.renderCalendarView()">
              ${[2025, 2026, 2027, 2028].map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}年</option>`).join('')}
            </select>
            <select class="form-control" style="width:auto; font-weight:700;" onchange="App.state.calendarMonth=Number(this.value); App.renderCalendarView()">
              ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${m}月</option>`).join('')}
            </select>
          </div>

          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-sm ${mode === 'month' ? 'btn-primary' : 'btn-secondary'}" onclick="App.state.calendarViewMode='month'; App.renderCalendarView()">月视图</button>
            <button class="btn btn-sm ${mode === 'week' ? 'btn-primary' : 'btn-secondary'}" onclick="App.state.calendarViewMode='week'; App.renderCalendarView()">周视图</button>
            <button class="btn btn-sm ${mode === 'list' ? 'btn-primary' : 'btn-secondary'}" onclick="App.state.calendarViewMode='list'; App.renderCalendarView()">当月列表视图</button>
            <button class="btn btn-sm ${mode === 'year' ? 'btn-primary' : 'btn-secondary'}" onclick="App.state.calendarViewMode='year'; App.renderCalendarView()">年度活动总表 (${year})</button>
          </div>
        </div>

        ${mode === 'month' ? `
          <div class="calendar-grid">
            ${['周日 Sun', '周一 Mon', '周二 Tue', '周三 Wed', '周四 Thu', '周五 Fri', '周六 Sat'].map(dn => `<div class="cal-day-header">${dn}</div>`).join('')}
            ${cells.map(day => {
              if (!day) return `<div class="cal-cell" style="background:#F8FAFC;"></div>`;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = events.filter(ev => ev.start_date <= dateStr && ev.end_date >= dateStr);
              return `
                <div class="cal-cell">
                  <div style="font-size:12.5px; font-weight:700; color:var(--text-secondary);">${day}日</div>
                  ${dayEvents.map(ev => `
                    <div class="cal-event-chip" onclick="App.openEvent('${ev.id}', 'ticklist')" title="点击进入第一页 Ticklist">
                      🎯 ${this.esc(ev.name)}
                    </div>
                  `).join('')}
                </div>
              `;
            }).join('')}
          </div>
        ` : mode === 'week' ? `
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="font-weight:700; color:var(--text-secondary);">${year}年${month}月 按周次活动与筹备节点排期：</div>
            ${[1, 2, 3, 4].map(wk => {
              const startD = (wk - 1) * 7 + 1;
              const endD = Math.min(daysInMonth, wk * 7 + 3);
              const sStr = `${year}-${String(month).padStart(2, '0')}-${String(startD).padStart(2, '0')}`;
              const eStr = `${year}-${String(month).padStart(2, '0')}-${String(endD).padStart(2, '0')}`;
              const wkEvs = monthEvents.filter(e => e.start_date >= sStr && e.start_date <= eStr);
              return `
                <div style="border:1px solid var(--border-color); border-radius:8px; padding:12px;">
                  <div style="font-weight:800; margin-bottom:6px;">第 ${wk} 周 (${sStr} ~ ${eStr})</div>
                  ${wkEvs.length === 0 ? `<div style="font-size:13px; color:var(--text-muted);">本周无正式举办活动（日常事前推广与材料采购跟进中）</div>` : wkEvs.map(ev => `
                    <div style="padding:8px 12px; background:var(--brand-red-light); border-left:4px solid var(--brand-red); border-radius:4px; cursor:pointer; margin-top:4px;" onclick="App.openEvent('${ev.id}', 'ticklist')">
                      <strong>${this.esc(ev.start_date)} ｜ ${this.esc(ev.name)} (${this.esc(ev.event_code)})</strong> — 负责人：${this.esc(ev.leader_name)} ｜ 状态：${this.esc(ev.status)}
                    </div>
                  `).join('')}
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>年份/月份</th>
                  <th>活动名称</th>
                  <th>类型</th>
                  <th>举行日期</th>
                  <th>地点/分行</th>
                  <th>负责人</th>
                  <th>Ticklist进度</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${(mode === 'year' ? yearEvents : monthEvents).map(ev => `
                  <tr>
                    <td style="font-weight:700; color:var(--brand-red);">${this.esc(ev.event_code)}</td>
                    <td>${ev.year}年${ev.month}月</td>
                    <td style="font-weight:800; cursor:pointer;" onclick="App.openEvent('${ev.id}', 'ticklist')">${this.esc(ev.name)}</td>
                    <td>${this.esc(ev.category)}</td>
                    <td>${this.esc(ev.start_date)}</td>
                    <td>${this.esc(ev.branch)} · ${this.esc(ev.location)}</td>
                    <td>${this.esc(ev.leader_name)}</td>
                    <td><strong>${ev.summary?.completionPct || 0}%</strong> (${ev.summary?.completedItems || 0}/${ev.summary?.totalItems || 0})</td>
                    <td><span class="status-pill status-progress">${this.esc(ev.status)}</span></td>
                    <td><button class="btn btn-primary btn-sm" onclick="App.openEvent('${ev.id}', 'ticklist')">查看 Ticklist</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  },

  // 4. MY TASKS & MULTI-VIEW TASK CENTER (Section 6)
  renderTasksView() {
    const main = document.getElementById('app-main-view');
    const today = new Date().toISOString().slice(0, 10);
    const next7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    let tasks = this.state.allTasks || [];

    const myId = this.state.currentUser?.id;
    const myToday = tasks.filter(t => t.assignee_id === myId && t.status !== '已完成' && t.due_date === today);
    const myNext7 = tasks.filter(t => t.assignee_id === myId && t.status !== '已完成' && t.due_date > today && t.due_date <= next7);
    const myOverdue = tasks.filter(t => t.assignee_id === myId && t.status !== '已完成' && t.due_date && t.due_date < today);
    const pendingReview = tasks.filter(t => t.approval_status === '待审核');

    if (this.state.taskFilterAssignee !== 'ALL') {
      tasks = tasks.filter(t => t.assignee_id === this.state.taskFilterAssignee);
    }
    if (this.state.taskFilterEvent !== 'ALL') {
      tasks = tasks.filter(t => t.event_id === this.state.taskFilterEvent);
    }
    if (this.state.taskFilterStatus !== 'ALL') {
      tasks = tasks.filter(t => t.status === this.state.taskFilterStatus);
    }

    const mode = this.state.taskViewMode;

    main.innerHTML = `
      <!-- Personal Focus Buckets for Logged-in Teacher/Leader -->
      <div class="kpi-grid">
        <div class="kpi-card" style="border-left:4px solid var(--brand-red);">
          <div class="kpi-label">我今天需要完成的任务</div>
          <div class="kpi-value">${myToday.length}</div>
          <div class="kpi-sub">当前登录：${this.esc(this.state.currentUser?.name)}</div>
        </div>
        <div class="kpi-card" style="border-left:4px solid #1D4ED8;">
          <div class="kpi-label">我未来 7 天的任务</div>
          <div class="kpi-value" style="color:#1D4ED8;">${myNext7.length}</div>
          <div class="kpi-sub">提前筹备避免延误</div>
        </div>
        <div class="kpi-card" style="border-left:4px solid #DC2626;">
          <div class="kpi-label">我的逾期未完成任务</div>
          <div class="kpi-value" style="color:#DC2626;">${myOverdue.length}</div>
          <div class="kpi-sub">请优先处理逾期事项</div>
        </div>
        <div class="kpi-card" style="border-left:4px solid #D97706;">
          <div class="kpi-label">等待主管审核任务</div>
          <div class="kpi-value" style="color:#D97706;">${pendingReview.length}</div>
          <div class="kpi-sub">完成后自动同步活动第一页 Ticklist</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <select class="form-control" style="width:auto;" onchange="App.state.taskFilterAssignee=this.value; App.renderTasksView()">
              <option value="ALL" ${this.state.taskFilterAssignee === 'ALL' ? 'selected' : ''}>全部老师的任务</option>
              <option value="${myId}" ${this.state.taskFilterAssignee === myId ? 'selected' : ''}>只看我的任务 (${this.esc(this.state.currentUser?.name)})</option>
              ${this.state.users.map(u => `<option value="${u.id}" ${this.state.taskFilterAssignee === u.id ? 'selected' : ''}>${this.esc(u.name)}</option>`).join('')}
            </select>

            <select class="form-control" style="width:auto;" onchange="App.state.taskFilterEvent=this.value; App.renderTasksView()">
              <option value="ALL" ${this.state.taskFilterEvent === 'ALL' ? 'selected' : ''}>全部活动</option>
              ${this.state.events.map(e => `<option value="${e.id}" ${this.state.taskFilterEvent === e.id ? 'selected' : ''}>${this.esc(e.name)}</option>`).join('')}
            </select>

            <select class="form-control" style="width:auto;" onchange="App.state.taskFilterStatus=this.value; App.renderTasksView()">
              <option value="ALL" ${this.state.taskFilterStatus === 'ALL' ? 'selected' : ''}>全部状态</option>
              ${['未开始', '进行中', '待审核', '已完成'].map(st => `<option value="${st}" ${this.state.taskFilterStatus === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>

          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-sm ${mode === 'list' ? 'btn-primary' : 'btn-secondary'}" onclick="App.state.taskViewMode='list'; App.renderTasksView()">列表视图</button>
            <button class="btn btn-sm ${mode === 'kanban' ? 'btn-primary' : 'btn-secondary'}" onclick="App.state.taskViewMode='kanban'; App.renderTasksView()">看板 Kanban</button>
            <button class="btn btn-sm ${mode === 'by-teacher' ? 'btn-primary' : 'btn-secondary'}" onclick="App.state.taskViewMode='by-teacher'; App.renderTasksView()">按老师工作量查看</button>
            <button class="btn btn-sm btn-primary" onclick="App.openAddTaskModal()">＋ 新增任务</button>
          </div>
        </div>

        ${mode === 'kanban' ? `
          <div class="kanban-grid">
            ${['未开始', '进行中', '待审核', '已完成'].map(colStatus => {
              const colTasks = tasks.filter(t => t.status === colStatus);
              return `
                <div class="kanban-col">
                  <div style="font-weight:800; display:flex; justify-content:space-between; align-items:center;">
                    <span>${colStatus}</span>
                    <span class="status-pill status-pending">${colTasks.length}</span>
                  </div>
                  ${colTasks.map(t => `
                    <div class="kanban-card">
                      <div style="font-size:11.5px; color:var(--brand-red); font-weight:700; cursor:pointer;" onclick="App.openEvent('${t.event_id}', 'ticklist')">
                        ${this.esc(t.event_name)} · 阶段${this.esc(t.stage)}
                      </div>
                      <div style="font-weight:800; margin:4px 0;">${this.esc(t.title)}</div>
                      <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">
                        👤 ${this.esc(t.assignee_name)} ｜ 📅 ${this.esc(t.due_date)}
                      </div>
                      <div style="display:flex; justify-content:space-between; align-items:center;">
                        ${this.approvalBadge(t.approval_status)}
                        <button class="btn btn-sm ${t.status === '已完成' ? 'btn-secondary' : 'btn-success'}"
                                onclick="App.updateTaskQuick('${t.id}', { status: '${t.status === '已完成' ? '进行中' : '已完成'}' })">
                          ${t.status === '已完成' ? '重开' : '✓ 完成'}
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `;
            }).join('')}
          </div>
        ` : mode === 'by-teacher' ? `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:14px;">
            ${this.state.users.map(u => {
              const uTasks = tasks.filter(t => t.assignee_id === u.id);
              const uDone = uTasks.filter(t => t.status === '已完成').length;
              return `
                <div style="border:1px solid var(--border-color); border-radius:8px; padding:14px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:16px;">👤 ${this.esc(u.name)}</strong>
                    <span class="status-pill status-progress">已完成 ${uDone} / ${uTasks.length}</span>
                  </div>
                  <div class="progress-track" style="margin-bottom:10px;">
                    <div class="progress-fill" style="width:${uTasks.length > 0 ? Math.round((uDone / uTasks.length) * 100) : 0}%;"></div>
                  </div>
                  <div style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;">
                    ${uTasks.map(t => `
                      <div style="font-size:12.5px; display:flex; justify-content:space-between; align-items:center; padding:5px 8px; background:var(--bg-subtle); border-radius:4px;">
                        <span>${t.status === '已完成' ? '☑' : '☐'} ${this.esc(t.title)}</span>
                        <span style="color:var(--text-muted);">${this.esc(t.due_date)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>任务标题 (与Ticklist同步)</th>
                  <th>所属活动</th>
                  <th>阶段</th>
                  <th>负责老师</th>
                  <th>截止日期</th>
                  <th>优先级</th>
                  <th>状态</th>
                  <th>主管审核</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${tasks.map(t => `
                  <tr>
                    <td style="font-weight:700;">
                      ${this.esc(t.title)}
                      ${t.rejection_reason ? `<div style="font-size:11.5px; color:#DC2626;">❗ 退回原因: ${this.esc(t.rejection_reason)}</div>` : ''}
                    </td>
                    <td><a href="javascript:void(0)" onclick="App.openEvent('${t.event_id}', 'ticklist')" style="color:var(--brand-red); font-weight:700;">${this.esc(t.event_name)}</a></td>
                    <td>阶段 ${this.esc(t.stage)}</td>
                    <td>${this.esc(t.assignee_name)}</td>
                    <td>${this.esc(t.due_date)}</td>
                    <td>${this.esc(t.priority)}</td>
                    <td>${this.statusBadge(t.status, t.due_date, t.status === '已完成' ? 1 : 0)}</td>
                    <td>${this.approvalBadge(t.approval_status)}</td>
                    <td>
                      <button class="btn btn-sm ${t.status === '已完成' ? 'btn-secondary' : 'btn-success'}"
                              onclick="App.updateTaskQuick('${t.id}', { status: '${t.status === '已完成' ? '进行中' : '已完成'}' })">
                        ${t.status === '已完成' ? '取消完成' : '✓ 勾选完成'}
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  },

  // 5. SHARED INVENTORY & MATERIAL CENTER (Section 7)
  async renderGlobalMaterialsView() {
    const main = document.getElementById('app-main-view');
    const inv = await this.api('/api/inventory');
    const materials = inv.materials || [];
    const txs = inv.transactions || [];

    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">📦 5+1 中心共用总库存管理 (防重复占用机制)</div>
            <div style="font-size:13px; color:var(--text-secondary);">不同活动共用同一种材料时，系统自动扣减已预留库存，防止同一批库存被多场活动重复占用。支持预留、领用、归还、损耗与调整记录。</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="App.openInventoryTxModal()">🔄 登记库存预留/领用/归还/损耗</button>
            <button class="btn btn-primary btn-sm" onclick="App.openNewSharedMaterialModal()">＋ 新增中心库存品项</button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>材料名称</th>
                <th>分类</th>
                <th>单位</th>
                <th>中心总库存</th>
                <th>已被活动预留</th>
                <th>当前可用剩余库存</th>
                <th>默认单价 (RM)</th>
                <th>常用供应商</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              ${materials.map(m => {
                const avail = Math.max(0, m.total_stock - m.reserved_stock);
                return `
                  <tr>
                    <td style="font-weight:800;">${this.esc(m.name)}</td>
                    <td>${this.esc(m.category)}</td>
                    <td>${this.esc(m.unit)}</td>
                    <td style="font-weight:700;">${m.total_stock}</td>
                    <td style="color:#D97706; font-weight:700;">${m.reserved_stock}</td>
                    <td><span class="status-pill ${avail > 0 ? 'status-completed' : 'status-overdue'}">可用: ${avail} ${this.esc(m.unit)}</span></td>
                    <td>RM ${Number(m.default_unit_price).toFixed(2)}</td>
                    <td>${this.esc(m.supplier_id)}</td>
                    <td>${this.esc(m.notes)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">📜 库存变动流水记录（入库 / 预留 / 领用 / 归还 / 损耗）</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>动作类型</th>
                <th>数量</th>
                <th>变动前 → 变动后</th>
                <th>操作老师</th>
                <th>备注说明</th>
              </tr>
            </thead>
            <tbody>
              ${txs.length === 0 ? `<tr><td colspan="6" style="color:var(--text-muted);">暂无库存变动流水</td></tr>` : txs.map(tx => `
                <tr>
                  <td>${this.esc(tx.created_at)}</td>
                  <td><span class="status-pill status-progress">${this.esc(tx.tx_type)}</span></td>
                  <td style="font-weight:700;">${tx.quantity}</td>
                  <td>${tx.before_stock} → <strong>${tx.after_stock}</strong></td>
                  <td>${this.esc(tx.operator_name)}</td>
                  <td>${this.esc(tx.notes)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openInventoryTxModal() {
    this.api('/api/inventory').then(inv => {
      const mats = inv.materials || [];
      const root = document.getElementById('app-modal-root');
      root.style.display = 'block';
      root.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal-panel" style="max-width:520px;">
            <h3 style="font-size:18px; font-weight:800; margin-bottom:14px;">🔄 库存预留／领用／归还／损耗登记</h3>
            <div class="form-grid" style="margin-bottom:14px;">
              <div class="form-group" style="grid-column:1 / -1;">
                <label>选择库存材料 *</label>
                <select class="form-control" id="itx-mat">
                  ${mats.map(m => `<option value="${m.id}">${this.esc(m.name)} (总:${m.total_stock}, 已预留:${m.reserved_stock}, 可用:${m.total_stock - m.reserved_stock}${m.unit})</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>操作类型</label>
                <select class="form-control" id="itx-type">
                  <option value="预留">预留 (锁定给活动，防重复占用)</option>
                  <option value="领用">领用 (实际出库消耗)</option>
                  <option value="归还">归还 (活动剩余退回总库)</option>
                  <option value="入库">采购新入库</option>
                  <option value="损耗">损耗核销</option>
                </select>
              </div>
              <div class="form-group">
                <label>数量 *</label>
                <input type="number" class="form-control" id="itx-qty" value="10" />
              </div>
              <div class="form-group" style="grid-column:1 / -1;">
                <label>备注说明</label>
                <input type="text" class="form-control" id="itx-notes" placeholder="例如：森林面具活动结束后归还多余双面胶" />
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
              <button class="btn btn-primary" onclick="App.submitInventoryTx()">确认提交</button>
            </div>
          </div>
        </div>
      `;
    });
  },

  async submitInventoryTx() {
    await this.api('/api/inventory/transaction', {
      method: 'POST',
      body: JSON.stringify({
        material_id: document.getElementById('itx-mat').value,
        tx_type: document.getElementById('itx-type').value,
        quantity: Number(document.getElementById('itx-qty').value),
        notes: document.getElementById('itx-notes').value
      })
    });
    this.closeModal();
    this.toast('库存变动已记录');
    this.renderGlobalMaterialsView();
  },

  openNewSharedMaterialModal() {
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:500px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:14px;">＋ 新增中心共用库存品项</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group"><label>材料名称 *</label><input type="text" class="form-control" id="nsm-name" /></div>
            <div class="form-group"><label>单位</label><input type="text" class="form-control" id="nsm-unit" value="个" /></div>
            <div class="form-group"><label>初始库存数量</label><input type="number" class="form-control" id="nsm-stock" value="50" /></div>
            <div class="form-group"><label>参考单价 (RM)</label><input type="number" step="0.01" class="form-control" id="nsm-price" value="2.00" /></div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitNewSharedMaterial()">保存</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitNewSharedMaterial() {
    const name = document.getElementById('nsm-name').value.trim();
    if (!name) return;
    await this.api('/api/inventory', {
      method: 'POST',
      body: JSON.stringify({
        name,
        unit: document.getElementById('nsm-unit').value,
        total_stock: Number(document.getElementById('nsm-stock').value),
        default_unit_price: Number(document.getElementById('nsm-price').value)
      })
    });
    this.closeModal();
    this.renderGlobalMaterialsView();
  },

  // 6. GLOBAL FINANCE OVERVIEW
  renderGlobalFinanceView() {
    const main = document.getElementById('app-main-view');
    const events = this.state.events || [];
    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">💰 5+1 各场活动预算与收支结余总览 (每场活动独立核算，绝不混账)</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">点击任意活动可直接进入该活动的独立账本录入费用与查看收据。</div>
          </div>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>活动编号</th>
                <th>活动名称</th>
                <th>日期</th>
                <th>预算总额 (RM)</th>
                <th>实际总成本 (RM)</th>
                <th>实际已收报名费 (RM)</th>
                <th>收支结余 (RM)</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${events.map(ev => {
                const s = ev.summary || {};
                return `
                  <tr>
                    <td style="font-weight:700; color:var(--brand-red);">${this.esc(ev.event_code)}</td>
                    <td style="font-weight:800;">${this.esc(ev.name)}</td>
                    <td>${this.esc(ev.start_date)}</td>
                    <td>RM ${Number(ev.budget_rm).toFixed(2)}</td>
                    <td style="color:var(--brand-red); font-weight:700;">RM ${Number(s.actualTotalCost || 0).toFixed(2)}</td>
                    <td style="color:#15803D; font-weight:700;">RM ${Number(s.totalPaidIncome || 0).toFixed(2)}</td>
                    <td style="font-weight:800; color:${(s.netBalanceRm || 0) >= 0 ? '#15803D' : '#DC2626'};">RM ${Number(s.netBalanceRm || 0).toFixed(2)}</td>
                    <td><button class="btn btn-primary btn-sm" onclick="App.openEvent('${ev.id}', 'finance')">进入活动财务账本</button></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // 7. GLOBAL REGISTRATIONS OVERVIEW
  renderGlobalRegistrationsView() {
    const main = document.getElementById('app-main-view');
    const events = this.state.events || [];
    main.innerHTML = `
      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">🎓 各场活动学生报名、出席与非本院生转化总览</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>活动编号</th>
                <th>活动名称</th>
                <th>预计名额</th>
                <th>已报名人数</th>
                <th>实际出席</th>
                <th>非本院生报名</th>
                <th>非本院生报读转化</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${events.map(ev => {
                const s = ev.summary || {};
                return `
                  <tr>
                    <td style="font-weight:700; color:var(--brand-red);">${this.esc(ev.event_code)}</td>
                    <td style="font-weight:800;">${this.esc(ev.name)}</td>
                    <td>${ev.expected_students} 人</td>
                    <td style="font-weight:700;">${s.activeRegistrations || 0} 人</td>
                    <td>${s.attendedCount || 0} 人</td>
                    <td style="color:var(--brand-red); font-weight:700;">${s.externalReg || 0} 人</td>
                    <td style="color:#15803D; font-weight:800;">${s.externalConverted || 0} 人</td>
                    <td><button class="btn btn-primary btn-sm" onclick="App.openEvent('${ev.id}', 'registrations')">管理报名与签到</button></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // 8. HISTORICAL EVENT ARCHIVES & MULTI-CRITERIA SEARCH (Section 12.2)
  async renderArchivesView() {
    const main = document.getElementById('app-main-view');
    const f = this.state.archiveFilters;
    const qs = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const res = await this.api(`/api/events?${qs.toString()}`);
    const events = res.events || [];

    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">🗂️ 历史活动永久档案库 &amp; 多条件精准检索 (Section 12)</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">
              按年份、月份、名称、类型、负责老师、地点、状态、年级、分行检索任何历史活动，重看完整 Ticklist、材料、报名与复盘，或一键复制为新活动。
            </div>
          </div>
        </div>

        <!-- 9 Search Filters -->
        <div class="form-grid" style="margin-bottom:16px; background:var(--bg-subtle); padding:14px; border-radius:8px;">
          <div class="form-group">
            <label>年份</label>
            <select class="form-control" onchange="App.state.archiveFilters.year=this.value; App.renderArchivesView()">
              <option value="">全部年份</option>
              ${[2025, 2026, 2027, 2028].map(y => `<option value="${y}" ${String(f.year) === String(y) ? 'selected' : ''}>${y}年</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>月份</label>
            <select class="form-control" onchange="App.state.archiveFilters.month=this.value; App.renderArchivesView()">
              <option value="">全部月份</option>
              ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${String(f.month) === String(m) ? 'selected' : ''}>${m}月</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>活动名称 / 编号 / 地点关键词</label>
            <input type="text" class="form-control" placeholder="输入关键词搜索..." value="${this.esc(f.search)}" oninput="App.state.archiveFilters.search=this.value; App.renderArchivesView()" />
          </div>
          <div class="form-group">
            <label>活动类型</label>
            <select class="form-control" onchange="App.state.archiveFilters.category=this.value; App.renderArchivesView()">
              <option value="">全部类型</option>
              ${['假期活动', '科学实验活动', '节庆活动', '学生比赛', '学生出游', '招生活动', '家长活动', '其他自定义活动'].map(c => `<option value="${c}" ${f.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>负责老师</label>
            <select class="form-control" onchange="App.state.archiveFilters.leader_id=this.value; App.renderArchivesView()">
              <option value="">全部负责人</option>
              ${this.state.users.map(u => `<option value="${u.id}" ${f.leader_id === u.id ? 'selected' : ''}>${this.esc(u.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>活动状态</label>
            <select class="form-control" onchange="App.state.archiveFilters.status=this.value; App.renderArchivesView()">
              <option value="">全部状态</option>
              ${['草稿', '筹备中', '宣传中', '开放报名', '准备就绪', '举办中', '已结束', '已归档', '已取消'].map(st => `<option value="${st}" ${f.status === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>中心分行</label>
            <select class="form-control" onchange="App.state.archiveFilters.branch=this.value; App.renderArchivesView()">
              <option value="">全部分行</option>
              ${['总院 Main Branch', 'Setia Alam 分行', 'Mount Austin 分行', 'Cheras 分行'].map(b => `<option value="${b}" ${f.branch === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>目标年级</label>
            <select class="form-control" onchange="App.state.archiveFilters.grade=this.value; App.renderArchivesView()">
              <option value="">全部年级</option>
              ${['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'].map(g => `<option value="${g}" ${f.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>活动编号</th>
                <th>年月</th>
                <th>活动名称</th>
                <th>类别</th>
                <th>举行日期</th>
                <th>负责人</th>
                <th>SOP完成率</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${events.length === 0 ? `<tr><td colspan="9" style="color:var(--text-muted); padding:20px;">未找到符合筛选条件的活动档案。</td></tr>` : events.map(ev => `
                <tr>
                  <td style="font-weight:700; color:var(--brand-red);">${this.esc(ev.event_code)}</td>
                  <td>${ev.year}年${ev.month}月</td>
                  <td style="font-weight:800;">${this.esc(ev.name)}</td>
                  <td>${this.esc(ev.category)}</td>
                  <td>${this.esc(ev.start_date)}</td>
                  <td>${this.esc(ev.leader_name)}</td>
                  <td><strong>${ev.summary?.completionPct || 0}%</strong></td>
                  <td><span class="status-pill ${ev.status === '已归档' || ev.status === '已结束' ? 'status-completed' : 'status-progress'}">${this.esc(ev.status)}</span></td>
                  <td style="display:flex; gap:6px;">
                    <button class="btn btn-primary btn-sm" onclick="App.openEvent('${ev.id}', 'ticklist')">查看档案</button>
                    <button class="btn btn-secondary btn-sm" onclick="App.openCopyEventModal('${ev.id}')">📑 复制</button>
                    <button class="btn btn-danger btn-sm" onclick="App.openDeleteEventModal('${ev.id}', '${this.esc(ev.name)}')">🗑️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // 9. SMART ANALYTICS & INSIGHTS (Section 18.3)
  async renderAnalyticsView() {
    const main = document.getElementById('app-main-view');
    const data = await this.api('/api/analytics');

    if (data.insufficient_data) {
      main.innerHTML = `<div class="card"><div class="alert-box alert-warning">数据不足：当前系统尚无足够活动记录生成分析报告。</div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">📈 1. 哪类活动参加人数较多 (按活动类型统计)</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>活动类型</th><th>举办场次</th><th>预计总人数</th><th>实际已报名人数</th></tr></thead>
            <tbody>
              ${data.catStats.map(c => `
                <tr>
                  <td style="font-weight:800;">${this.esc(c.category)}</td>
                  <td>${c.event_count} 场</td>
                  <td>${c.total_expected || 0} 人</td>
                  <td style="font-weight:700; color:var(--brand-red);">${c.total_registered || 0} 人</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">📣 2. 哪个宣传渠道报名转化率较高 (基于真实录入数据)</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>宣传渠道</th><th>总名单库</th><th>已联系</th><th>已报名</th><th>实际出席</th><th>成功报读转化</th><th>平均转化率</th></tr></thead>
            <tbody>
              ${data.channelStats.map(ch => `
                <tr>
                  <td style="font-weight:800;">${this.esc(ch.source_name)}</td>
                  <td>${ch.total_db}</td>
                  <td>${ch.total_contacted}</td>
                  <td>${ch.total_registered}</td>
                  <td>${ch.total_attended}</td>
                  <td style="font-weight:700; color:#15803D;">${ch.total_success}</td>
                  <td style="font-weight:800; color:var(--brand-red);">${ch.conversion_rate}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(420px, 1fr)); gap:18px;">
        <div class="card">
          <div class="card-title" style="margin-bottom:12px;">⏰ 3. 哪些任务经常延误 / 逾期</div>
          ${data.delayedTasks.length === 0 ? `<div style="color:var(--text-muted); font-size:13.5px;">目前没有逾期任务记录（或数据不足）。</div>` : `
            <table class="data-table">
              <thead><tr><th>SOP 任务名称</th><th>阶段</th><th>逾期次数</th></tr></thead>
              <tbody>
                ${data.delayedTasks.map(dt => `
                  <tr>
                    <td style="font-weight:700;">${this.esc(dt.title)}</td>
                    <td>阶段 ${this.esc(dt.stage)}</td>
                    <td style="color:#DC2626; font-weight:800;">${dt.delay_count} 次</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div class="card">
          <div class="card-title" style="margin-bottom:12px;">📦 4. 哪些材料重复采购 &amp; 成本变化</div>
          ${data.repeatMaterials.length === 0 ? `<div style="color:var(--text-muted);">数据不足</div>` : `
            <table class="data-table">
              <thead><tr><th>材料名称</th><th>使用场次</th><th>累计需求</th><th>累计采购金额</th></tr></thead>
              <tbody>
                ${data.repeatMaterials.map(rm => `
                  <tr>
                    <td style="font-weight:700;">${this.esc(rm.name)}</td>
                    <td>${rm.event_count} 场</td>
                    <td>${rm.total_req} ${this.esc(rm.unit)}</td>
                    <td style="color:var(--brand-red); font-weight:700;">RM ${Number(rm.total_spent || 0).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
  },

  // 10. SOP TEMPLATES MANAGEMENT (Section 3B & 18.4)
  renderTemplatesView() {
    const main = document.getElementById('app-main-view');
    const tpls = this.state.templates || [];

    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">📋 SOP 活动模板管理中心</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">支持原版 Counter SOP、假期活动、出游、节庆、比赛、空白及自定义模板管理。</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:16px;">
          ${tpls.map(t => `
            <div style="border:1px solid var(--border-color); border-radius:8px; padding:16px; background:#FFFFFF;">
              <div style="font-weight:800; font-size:16px; color:var(--brand-red); margin-bottom:4px;">${this.esc(t.name)}</div>
              <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">代码: ${this.esc(t.code)} ｜ 适用分类: ${this.esc(t.category)}</div>
              <p style="font-size:13px; color:var(--text-secondary); margin-bottom:10px;">${this.esc(t.description)}</p>
              <div style="font-size:12.5px; font-weight:700;">包含预设检查项：${(t.items || []).length} 项 (阶段A/B/C)</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  // 11. TEACHERS & RBAC PERMISSIONS MANAGEMENT (Section 15)
  renderUsersView() {
    const main = document.getElementById('app-main-view');
    const isAdmin = this.state.currentUser?.role_id === 'admin';
    const roleNames = { admin: 'Admin／院长', leader: '活动负责人', teacher: '老师' };

    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">👥 老师账户与三层权限管理 (Admin／院长 · 活动负责人 · 老师)</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">
              Admin可灵活授权特定负责人或老师是否允许查看「活动财务预算」与「学生家长敏感联系方式」。
            </div>
          </div>
          ${isAdmin ? `<button class="btn btn-primary btn-sm" onclick="App.openAddUserModal()">＋ 新增老师账户</button>` : ''}
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>登录账号</th>
                <th>系统角色</th>
                <th>所属分行</th>
                <th>联系电话</th>
                <th>财务预算查看权</th>
                <th>家长敏感电话查看权</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${this.state.users.map(u => `
                <tr>
                  <td style="font-weight:800;">${this.esc(u.name)}</td>
                  <td><code>${this.esc(u.username)}</code></td>
                  <td><span class="status-pill ${u.role_id === 'admin' ? 'status-overdue' : (u.role_id === 'leader' ? 'status-progress' : 'status-pending')}">${roleNames[u.role_id] || u.role_id}</span></td>
                  <td>${this.esc(u.branch)}</td>
                  <td>${this.esc(u.phone || '-')}</td>
                  <td>
                    <input type="checkbox" ${u.can_view_finance || u.role_id === 'admin' ? 'checked' : ''} ${!isAdmin || u.role_id === 'admin' ? 'disabled' : ''}
                           onchange="App.toggleUserPerm('${u.id}', 'can_view_finance', this.checked)" />
                    ${u.can_view_finance || u.role_id === 'admin' ? '允许查看财务' : '无权限'}
                  </td>
                  <td>
                    <input type="checkbox" ${u.can_view_sensitive_contacts || u.role_id === 'admin' ? 'checked' : ''} ${!isAdmin || u.role_id === 'admin' ? 'disabled' : ''}
                           onchange="App.toggleUserPerm('${u.id}', 'can_view_sensitive_contacts', this.checked)" />
                    ${u.can_view_sensitive_contacts || u.role_id === 'admin' ? '允许看完整电话' : '脱敏隐藏'}
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="App.switchUser('${u.id}')">以此身份体验</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async toggleUserPerm(userId, field, checked) {
    await this.api(`/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ [field]: checked })
    });
    this.toast('老师权限设置已更新');
    await this.loadInitialData();
    this.renderUsersView();
  },

  openAddUserModal() {
    const root = document.getElementById('app-modal-root');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-panel" style="max-width:500px;">
          <h3 style="font-size:18px; font-weight:800; margin-bottom:14px;">＋ 新增老师账户</h3>
          <div class="form-grid" style="margin-bottom:14px;">
            <div class="form-group"><label>老师姓名 *</label><input type="text" class="form-control" id="nu-name" placeholder="例如：王老师 (Teacher Ong)" /></div>
            <div class="form-group"><label>登录用户名 *</label><input type="text" class="form-control" id="nu-user" placeholder="ong" /></div>
            <div class="form-group">
              <label>角色权限</label>
              <select class="form-control" id="nu-role">
                <option value="teacher">老师</option>
                <option value="leader">活动负责人</option>
                <option value="admin">Admin／院长</option>
              </select>
            </div>
            <div class="form-group"><label>所属分行</label><input type="text" class="form-control" id="nu-branch" value="总院 Main Branch" /></div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn btn-primary" onclick="App.submitAddUser()">创建账户</button>
          </div>
        </div>
      </div>
    `;
  },

  async submitAddUser() {
    const name = document.getElementById('nu-name').value.trim();
    const username = document.getElementById('nu-user').value.trim();
    if (!name || !username) return this.toast('请填写姓名与登录用户名', 'error');
    await this.api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name,
        username,
        role_id: document.getElementById('nu-role').value,
        branch: document.getElementById('nu-branch').value
      })
    });
    this.closeModal();
    this.toast('新老师账户已创建');
    await this.loadInitialData();
    this.renderUserSelector();
    this.renderUsersView();
  },

  // 12. SYSTEM SETTINGS, BACKUP & AUDIT TRAIL (Section 19)
  async renderSettingsView() {
    const main = document.getElementById('app-main-view');
    const data = await this.api('/api/analytics');
    const logs = data.auditLogs || [];

    main.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">⚙️ 系统设置、SQLite 数据库备份与全站审计日志</div>
            <div style="font-size:12.5px; color:var(--text-secondary);">所有活动、Ticklist打勾、任务同步、材料采购与报名记录均实时持久化在后端 SQLite 数据库中。</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="App.downloadFullBackup()">💾 导出全量数据库备份 (JSON)</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:12px;">🛡️ 系统全站操作记录 (Audit Logs)</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>角色</th>
                <th>模块</th>
                <th>操作动作</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td>${this.esc(l.created_at)}</td>
                  <td style="font-weight:700;">${this.esc(l.user_name)}</td>
                  <td>${this.esc(l.role_id)}</td>
                  <td>${this.esc(l.module)}</td>
                  <td>${this.esc(l.action)}</td>
                  <td>${this.esc(l.details)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async downloadFullBackup() {
    const dump = await this.api('/api/system/backup');
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `5plus1_SOP_Database_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    this.toast('全量数据库备份已导出下载');
  }
});

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
