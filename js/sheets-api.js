/**
 * Google Sheets API 통신 모듈
 *
 * Google Apps Script 웹앱을 통해 Google Sheets에 CRUD 수행
 * OAuth 로그인 불필요 — 웹앱이 인증을 대신 처리합니다.
 *
 * ※ Spreadsheet ID는 Tableau Extension settings에서 대시보드별로 가져옵니다.
 */

/**
 * 현재 대시보드에 연결된 Spreadsheet ID를 반환합니다.
 */
function getSpreadsheetId() {
  const id = tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.SPREADSHEET_ID);
  if (!id || id === 'YOUR_SPREADSHEET_ID') {
    throw new Error('고객사 스프레드시트가 설정되지 않았습니다. [설정] 버튼을 눌러 연결하세요.');
  }
  return id;
}

/**
 * 웹앱 GET 요청
 */
async function webappGet(params) {
  const query = Object.keys(params)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  const url = CONFIG.WEBAPP_URL + '?' + query;

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('웹앱 요청 실패: ' + res.status);

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * 웹앱 POST 요청
 */
async function webappPost(body) {
  const res = await fetch(CONFIG.WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error('웹앱 요청 실패: ' + res.status);

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ── CRUD 함수 ──

/**
 * 전체 메모 조회
 * @returns {Array<Object>} 메모 객체 배열
 */
async function getAllMemos() {
  const spreadsheetId = getSpreadsheetId();
  const data = await webappGet({
    action: 'getAll',
    spreadsheetId: spreadsheetId
  });
  return data.memos || [];
}

/**
 * 특정 출원번호의 메모 조회
 */
async function getMemosByPatent(출원번호) {
  const all = await getAllMemos();
  return all.filter(m => m['출원번호'] === 출원번호);
}

/**
 * 메모 추가
 */
async function addMemo(memoData) {
  const spreadsheetId = getSpreadsheetId();
  return webappPost({
    action: 'add',
    spreadsheetId: spreadsheetId,
    memo: memoData
  });
}

/**
 * 메모 수정
 */
async function updateMemo(rowIndex, memoData) {
  const spreadsheetId = getSpreadsheetId();
  return webappPost({
    action: 'update',
    spreadsheetId: spreadsheetId,
    rowIndex: rowIndex,
    memo: memoData
  });
}

/**
 * 메모 삭제
 */
async function deleteMemo(rowIndex) {
  const spreadsheetId = getSpreadsheetId();
  return webappPost({
    action: 'delete',
    spreadsheetId: spreadsheetId,
    rowIndex: rowIndex
  });
}

/**
 * 메모가 있는 출원번호 Set 반환
 */
async function getPatentsWithMemo() {
  const memos = await getAllMemos();
  return new Set(memos.map(m => m['출원번호']));
}

/**
 * 스프레드시트 연결 테스트
 */
async function testConnection(spreadsheetId) {
  return webappGet({
    action: 'test',
    spreadsheetId: spreadsheetId
  });
}

/**
 * Date → 'yyyy.MM.dd HH:mm:ss' 형식 문자열
 */
function formatDateTime(d) {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${Y}.${M}.${D} ${h}:${m}:${s}`;
}
