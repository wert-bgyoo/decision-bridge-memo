/**
 * index.js — 대시보드에 삽입되는 메인 Extension 로직
 *
 * 역할:
 * 1. 고객사 스프레드시트 연결 여부 확인 (미설정 시 설정 팝업 자동 오픈)
 * 2. Tableau 보유특허목록 워크시트의 마크 선택 이벤트 감지
 * 3. 선택된 특허 정보를 settings에 저장
 * 4. displayDialogAsync로 메모 입력/목록/설정 팝업 호출
 * 5. 메모 유무 정보를 settings에 저장 (Tableau 계산필드 참조용)
 */

let selectedPatent = null;
let selectedPatents = [];  // 다중 선택 지원
let patentsWithMemo = new Set();

(async () => {
  // ── Tableau Extension 초기화 ──
  await tableau.extensions.initializeAsync();

  // ── 설정 버튼은 항상 활성화 ──
  document.getElementById('btnSettings').addEventListener('click', openSettingsDialog);

  // ── 고객사 설정 확인 ──
  if (!isClientConfigured()) {
    // 최초 진입 시 — 설정 팝업 자동 오픈
    showNotConfigured();
    await openSettingsDialog();
    return; // 설정 완료 후 페이지 재로드됨
  }

  // ── 고객사 연결 완료 상태 ──
  await initMainUI();
})();

/**
 * 고객사 미설정 상태 표시
 */
function showNotConfigured() {
  document.getElementById('btnAddMemo').disabled = true;
  document.getElementById('btnMemoList').disabled = true;
  document.getElementById('selectedInfo').innerHTML =
    '<span class="warning-msg">[설정] 버튼을 눌러 고객사 스프레드시트를 연결하세요</span>';
}

/**
 * 메인 UI 초기화 (고객사 설정 완료 후)
 */
async function initMainUI() {
  const dashboard = tableau.extensions.dashboardContent.dashboard;
  const clientName = getClientName();

  // ── 메모 목록, 갱신 버튼 활성화 ──
  document.getElementById('btnMemoList').disabled = false;
  document.getElementById('btnRefresh').disabled = false;

  // ── 고객사 이름 + 초기 안내 표시 ──
  document.getElementById('selectedInfo').innerHTML =
    `<span class="client-badge">${clientName}</span> ` +
    `<span class="status-msg">특허를 선택하면 메모를 추가할 수 있습니다</span>`;

  // ── 메모 유무 정보 로드 ──
  await refreshMemoIndicators();

  // ── 보유특허목록 워크시트 찾기 ──
  const patentSheet = dashboard.worksheets.find(
    ws => ws.name === CONFIG.PATENT_WORKSHEET_NAME
  );

  if (!patentSheet) {
    document.getElementById('selectedInfo').innerHTML =
      `<span class="client-badge">${clientName}</span> ` +
      `<span class="status-msg">워크시트 "${CONFIG.PATENT_WORKSHEET_NAME}"을 찾을 수 없습니다</span>`;
    return;
  }

  // ── 마크 선택 이벤트 리스너 ──
  patentSheet.addEventListener(
    tableau.TableauEventType.MarkSelectionChanged,
    handleMarkSelection
  );

  // ── 메모 추가 버튼 ──
  document.getElementById('btnAddMemo').addEventListener('click', openMemoDialog);

  // ── 메모 목록 버튼 ──
  document.getElementById('btnMemoList').addEventListener('click', openMemoListDialog);

  // ── 메모 갱신 버튼 ──
  document.getElementById('btnRefresh').addEventListener('click', handleRefresh);
}

/**
 * 마크(특허) 선택 이벤트 핸들러
 */
async function handleMarkSelection(event) {
  const marks = await event.getMarksAsync();

  if (marks.data.length === 0 || marks.data[0].data.length === 0) {
    clearSelection();
    return;
  }

  const columns = marks.data[0].columns;
  const rows = marks.data[0].data;

  // 컬럼 인덱스 탐색
  const appNumIdx = columns.findIndex(c => c.fieldName === '출원번호');
  const titleIdx = columns.findIndex(c => c.fieldName === '발명의 명칭');
  const gradeIdx = columns.findIndex(c => c.fieldName === 'grade');

  if (appNumIdx < 0) {
    console.error('출원번호 컬럼을 찾을 수 없습니다');
    return;
  }

  // 모든 선택된 행을 배열로 저장
  selectedPatents = rows.map(function(row) {
    return {
      출원번호: row[appNumIdx].formattedValue,
      발명의_명칭: titleIdx >= 0 ? row[titleIdx].formattedValue : '',
      grade: gradeIdx >= 0 ? row[gradeIdx].formattedValue : ''
    };
  });

  // 첫 번째 선택 항목을 대표로 저장 (호환성)
  selectedPatent = selectedPatents[0];

  // UI 업데이트
  document.getElementById('btnAddMemo').disabled = false;

  const clientName = getClientName();
  const infoEl = document.getElementById('selectedInfo');

  if (selectedPatents.length === 1) {
    // 단일 선택
    const hasMemo = patentsWithMemo.has(selectedPatent.출원번호);
    infoEl.innerHTML =
      `<span class="client-badge">${clientName}</span> ` +
      `<span class="num">${selectedPatent.출원번호}</span> ` +
      (hasMemo ? '<span class="memo-badge">메모</span> ' : '') +
      selectedPatent.발명의_명칭;
  } else {
    // 다중 선택
    infoEl.innerHTML =
      `<span class="client-badge">${clientName}</span> ` +
      `<span class="num">${selectedPatents.length}건 선택</span> ` +
      `<span class="status-msg">${selectedPatent.출원번호} 외 ${selectedPatents.length - 1}건</span>`;
  }

  // settings에 선택 정보 저장 (팝업에서 참조)
  tableau.extensions.settings.set(CONFIG.SETTINGS_KEYS.SELECTED_PATENT, JSON.stringify(selectedPatents));
  await tableau.extensions.settings.saveAsync();
}

/**
 * 선택 해제
 */
function clearSelection() {
  selectedPatent = null;
  selectedPatents = [];
  document.getElementById('btnAddMemo').disabled = true;
  const clientName = getClientName();
  document.getElementById('selectedInfo').innerHTML =
    `<span class="client-badge">${clientName}</span> ` +
    `<span class="status-msg">특허를 선택하면 메모를 추가할 수 있습니다</span>`;
}

/**
 * 설정 팝업 열기
 */
async function openSettingsDialog() {
  try {
    const result = await tableau.extensions.ui.displayDialogAsync(
      './settings.html',
      '',
      {
        width: CONFIG.DIALOG_SETTINGS.width,
        height: CONFIG.DIALOG_SETTINGS.height,
        title: '고객사 스프레드시트 설정'
      }
    );

    // 설정 완료 후 메인 UI 초기화
    if (result === 'configured') {
      if (isClientConfigured()) {
        await initMainUI();
      }
    }
  } catch (e) {
    if (e.errorCode !== tableau.ErrorCodes.DialogClosedByUser) {
      console.error('설정 팝업 오류:', e);
    }
  }
}

/**
 * 메모 입력 팝업 열기
 */
async function openMemoDialog() {
  if (!selectedPatent) return;

  try {
    const result = await tableau.extensions.ui.displayDialogAsync(
      './dialog.html',
      selectedPatent.출원번호,
      {
        width: CONFIG.DIALOG_MEMO.width,
        height: CONFIG.DIALOG_MEMO.height,
        title: '특허 메모 추가'
      }
    );

    if (result === 'saved') {
      await refreshMemoIndicators();
      updateSelectionDisplay();
    }
  } catch (e) {
    if (e.errorCode !== tableau.ErrorCodes.DialogClosedByUser) {
      console.error('팝업 오류:', e);
    }
  }
}

/**
 * 메모 목록 팝업 열기
 */
async function openMemoListDialog() {
  try {
    const result = await tableau.extensions.ui.displayDialogAsync(
      './memo-list.html',
      '',
      {
        width: CONFIG.DIALOG_LIST.width,
        height: CONFIG.DIALOG_LIST.height,
        title: '메모 목록 관리'
      }
    );

    // 목록에서 수정/삭제가 발생한 경우 갱신
    if (result === 'updated') {
      await refreshMemoIndicators();
      updateSelectionDisplay();
    }
  } catch (e) {
    if (e.errorCode !== tableau.ErrorCodes.DialogClosedByUser) {
      console.error('목록 팝업 오류:', e);
    }
  }
}

/**
 * 메모 갱신 버튼 핸들러
 */
async function handleRefresh() {
  const btn = document.getElementById('btnRefresh');
  btn.disabled = true;
  btn.textContent = '갱신 중...';

  try {
    await refreshMemoIndicators();
    updateSelectionDisplay();
    btn.textContent = '갱신 완료';
    setTimeout(function() { btn.textContent = '메모 갱신'; btn.disabled = false; }, 1500);
  } catch (e) {
    btn.textContent = '갱신 실패';
    setTimeout(function() { btn.textContent = '메모 갱신'; btn.disabled = false; }, 2000);
  }
}

/**
 * 현재 선택된 특허의 메모 표시를 갱신
 */
function updateSelectionDisplay() {
  if (!selectedPatent) return;

  const clientName = getClientName();
  const infoEl = document.getElementById('selectedInfo');

  if (selectedPatents.length === 1) {
    const hasMemo = patentsWithMemo.has(selectedPatent.출원번호);
    infoEl.innerHTML =
      `<span class="client-badge">${clientName}</span> ` +
      `<span class="num">${selectedPatent.출원번호}</span> ` +
      (hasMemo ? '<span class="memo-badge">메모</span> ' : '') +
      selectedPatent.발명의_명칭;
  } else if (selectedPatents.length > 1) {
    infoEl.innerHTML =
      `<span class="client-badge">${clientName}</span> ` +
      `<span class="num">${selectedPatents.length}건 선택</span> ` +
      `<span class="status-msg">${selectedPatent.출원번호} 외 ${selectedPatents.length - 1}건</span>`;
  }
}

/**
 * 메모가 있는 출원번호 목록 갱신 → settings에 저장
 */
async function refreshMemoIndicators() {
  try {
    patentsWithMemo = await getPatentsWithMemo();
    tableau.extensions.settings.set(
      CONFIG.SETTINGS_KEYS.PATENTS_WITH_MEMO,
      JSON.stringify([...patentsWithMemo])
    );
    await tableau.extensions.settings.saveAsync();
  } catch (e) {
    console.warn('메모 유무 갱신 실패:', e);
  }
}
