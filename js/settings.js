/**
 * settings.js — 고객사 스프레드시트 연결 설정 팝업 로직
 *
 * 역할:
 * 1. Google Sheets URL 또는 ID 입력 받기
 * 2. 연결 테스트 (시트 존재 확인, 접근 권한 확인)
 * 3. 통과하면 Tableau Extension settings에 저장
 */

let extractedId = null;  // URL에서 추출된 Spreadsheet ID
let testPassed = false;  // 연결 테스트 통과 여부

(async () => {
  try {
    // ── Tableau 팝업 초기화 ──
    await tableau.extensions.initializeDialogAsync();

    // ── 현재 설정 표시 ──
    displayCurrentStatus();

    // ── 기존 값 채우기 ──
    const savedName = tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.CLIENT_NAME) || '';
    const savedId = tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.SPREADSHEET_ID) || '';
    document.getElementById('clientName').value = savedName;
    if (savedId && savedId !== 'YOUR_SPREADSHEET_ID') {
      document.getElementById('spreadsheetInput').value = savedId;
    }

    // ── 이벤트 리스너 ──
    document.getElementById('spreadsheetInput').addEventListener('input', onInputChange);
    document.getElementById('btnTest').addEventListener('click', runConnectionTest);
    document.getElementById('btnSave').addEventListener('click', saveSettings);
    document.getElementById('btnCancel').addEventListener('click', () => {
      tableau.extensions.ui.closeDialog('cancelled');
    });
  } catch (e) {
    document.getElementById('currentStatus').textContent = '초기화 오류: ' + e.message;
    document.getElementById('currentStatus').className = 'value not-connected';
  }

  // ── Enter 키로 테스트 실행 ──
  document.getElementById('spreadsheetInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runConnectionTest();
  });
})();

/**
 * 현재 연결 상태 표시
 */
function displayCurrentStatus() {
  const statusEl = document.getElementById('currentStatus');
  const name = tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.CLIENT_NAME);
  const id = tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.SPREADSHEET_ID);

  if (id && id !== 'YOUR_SPREADSHEET_ID') {
    statusEl.textContent = `${name || '(이름 없음)'} — 연결됨`;
    statusEl.className = 'value connected';
  } else {
    statusEl.textContent = '연결된 스프레드시트 없음';
    statusEl.className = 'value not-connected';
  }
}

/**
 * 입력값 변경 시 — URL에서 ID 추출 시도
 */
function onInputChange() {
  testPassed = false;
  document.getElementById('btnSave').disabled = true;
  document.getElementById('testResult').style.display = 'none';

  const input = document.getElementById('spreadsheetInput').value.trim();
  extractedId = extractSpreadsheetId(input);
}

/**
 * Google Sheets URL 또는 순수 ID에서 Spreadsheet ID 추출
 *
 * 지원하는 입력 형태:
 * - 전체 URL: https://docs.google.com/spreadsheets/d/1aBcDeF.../edit#gid=0
 * - 순수 ID:  1aBcDeFgHiJkLmNoPqRsTuVwXyZ
 */
function extractSpreadsheetId(input) {
  if (!input) return null;

  // URL 형태인 경우
  const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];

  // 순수 ID 형태인 경우 (영문, 숫자, -, _ 로 구성된 긴 문자열)
  const idMatch = input.match(/^[a-zA-Z0-9_-]{20,}$/);
  if (idMatch) return input;

  return null;
}

/**
 * 연결 테스트 실행
 */
async function runConnectionTest() {
  const input = document.getElementById('spreadsheetInput').value.trim();
  extractedId = extractSpreadsheetId(input);

  const resultEl = document.getElementById('testResult');

  if (!extractedId) {
    resultEl.style.display = 'block';
    resultEl.className = 'test-result error';
    resultEl.innerHTML =
      'Spreadsheet ID를 인식할 수 없습니다.<br>' +
      'Google Sheets 주소 전체를 붙여넣거나, ID만 입력하세요.';
    return;
  }

  // 로딩 상태
  resultEl.style.display = 'block';
  resultEl.className = 'test-result loading';
  resultEl.textContent = '연결 테스트 중...';
  document.getElementById('btnTest').disabled = true;

  try {
    const result = await testConnection(extractedId);

    resultEl.style.display = 'block';
    resultEl.className = 'test-result success';
    resultEl.innerHTML =
      `연결 성공!<br>` +
      `스프레드시트: <strong>${result.sheetTitle}</strong><br>` +
      `저장된 메모: ${result.memoCount}건`;

    testPassed = true;
    document.getElementById('btnSave').disabled = false;

    // 고객사 이름이 비어있으면 스프레드시트 이름으로 자동 채우기
    const nameInput = document.getElementById('clientName');
    if (!nameInput.value.trim()) {
      nameInput.value = result.sheetTitle.replace('DECISION_BRIDGE_MEMO_', '');
    }
  } catch (e) {
    resultEl.style.display = 'block';
    resultEl.className = 'test-result error';
    resultEl.innerHTML = e.message.replace(/\n/g, '<br>');
    testPassed = false;
    document.getElementById('btnSave').disabled = true;
  } finally {
    document.getElementById('btnTest').disabled = false;
  }
}

/**
 * 설정 저장
 */
async function saveSettings() {
  if (!testPassed || !extractedId) {
    alert('먼저 연결 테스트를 통과해야 합니다.');
    return;
  }

  const clientName = document.getElementById('clientName').value.trim();
  if (!clientName) {
    alert('고객사 이름을 입력하세요.');
    document.getElementById('clientName').focus();
    return;
  }

  // Tableau Extension settings에 저장
  tableau.extensions.settings.set(CONFIG.SETTINGS_KEYS.SPREADSHEET_ID, extractedId);
  tableau.extensions.settings.set(CONFIG.SETTINGS_KEYS.CLIENT_NAME, clientName);
  await tableau.extensions.settings.saveAsync();

  tableau.extensions.ui.closeDialog('configured');
}
