/**
 * Google Sheets API 통신 모듈
 *
 * Google Identity Services (GIS) 라이브러리를 사용하여
 * OAuth 2.0 인증 후 Google Sheets에 CRUD 수행
 *
 * ※ Spreadsheet ID는 CONFIG에 고정되지 않고,
 *   Tableau Extension settings에서 대시보드별로 가져옵니다.
 *   → getSpreadsheetId() 함수 사용
 */

// ── 인증 상태 ──
let _accessToken = null;
let _tokenClient = null;

/**
 * 현재 대시보드에 연결된 Spreadsheet ID를 반환합니다.
 * 팝업(dialog, memo-list)에서도 사용할 수 있도록
 * settings에서 가져옵니다.
 */
function getSpreadsheetId() {
  const id = tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.SPREADSHEET_ID);
  if (!id || id === 'YOUR_SPREADSHEET_ID') {
    throw new Error('고객사 스프레드시트가 설정되지 않았습니다. [설정] 버튼을 눌러 연결하세요.');
  }
  return id;
}

/**
 * Google Identity Services 라이브러리 로드 대기
 * async defer로 로드되므로 준비될 때까지 기다려야 함
 */
function waitForGoogleAuth(maxWait) {
  maxWait = maxWait || 5000;
  return new Promise(function(resolve, reject) {
    if (typeof google !== 'undefined' && google.accounts) {
      resolve();
      return;
    }
    var elapsed = 0;
    var interval = setInterval(function() {
      elapsed += 100;
      if (typeof google !== 'undefined' && google.accounts) {
        clearInterval(interval);
        resolve();
      } else if (elapsed >= maxWait) {
        clearInterval(interval);
        reject(new Error('Google 로그인 라이브러리를 불러오지 못했습니다.'));
      }
    }, 100);
  });
}

/**
 * Google Identity Services 토큰 클라이언트 초기화
 * index.html, dialog.html, memo-list.html 로드 시 호출
 */
async function initGoogleAuth() {
  await waitForGoogleAuth(5000);
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.OAUTH_CLIENT_ID,
    scope: CONFIG.OAUTH_SCOPES,
    callback: function() {} // requestAccessToken 호출 시 덮어씀
  });
}

/**
 * 액세스 토큰 획득 (없으면 OAuth 팝업 표시)
 */
async function getAccessToken() {
  if (_accessToken) return _accessToken;

  return new Promise((resolve, reject) => {
    _tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      _accessToken = response.access_token;
      resolve(_accessToken);
    };
    _tokenClient.requestAccessToken();
  });
}

// ── CRUD 함수 ──

/**
 * 전체 메모 조회
 * @returns {Array<Object>} 메모 객체 배열
 */
async function getAllMemos() {
  const spreadsheetId = getSpreadsheetId();
  const token = await getAccessToken();
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/${CONFIG.SHEET_NAME}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) throw new Error(`조회 실패: ${res.status}`);

  const data = await res.json();
  if (!data.values || data.values.length < 2) return [];

  const headers = data.values[0];
  return data.values.slice(1)
    .map((row, idx) => {
      const obj = { _rowIndex: idx };
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    })
    .filter(obj => obj.memo_id); // 빈 행 제외
}

/**
 * 특정 출원번호의 메모 조회
 * @param {string} 출원번호
 * @returns {Array<Object>}
 */
async function getMemosByPatent(출원번호) {
  const all = await getAllMemos();
  return all.filter(m => m['출원번호'] === 출원번호);
}

/**
 * 메모 추가
 * @param {Object} memoData - { 출원번호, 발명의_명칭, 상태, 카테고리, 메모내용, 작성자 }
 * @returns {Object} API 응답
 */
async function addMemo(memoData) {
  const spreadsheetId = getSpreadsheetId();
  const token = await getAccessToken();
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/${CONFIG.SHEET_NAME}:append?valueInputOption=USER_ENTERED`;

  const now = formatDateTime(new Date());
  const memoId = crypto.randomUUID();

  // 컬럼 순서: 출원번호, 발명의 명칭, 상태, 카테고리, 메모내용, 작성자, 수정일시, 작성일시, memo_id
  const body = {
    values: [[
      memoData['출원번호'],
      memoData['발명의_명칭'] || '',
      memoData['상태'] || '진행중',
      memoData['카테고리'],
      memoData['메모내용'],
      memoData['작성자'],
      now,                          // 수정일시
      now,                          // 작성일시
      memoId
    ]]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`추가 실패: ${res.status}`);
  return res.json();
}

/**
 * 메모 수정
 * @param {number} rowIndex - getAllMemos()에서 받은 _rowIndex
 * @param {Object} memoData - 전체 필드 포함
 * @returns {Object} API 응답
 */
async function updateMemo(rowIndex, memoData) {
  const spreadsheetId = getSpreadsheetId();
  const token = await getAccessToken();
  const sheetRow = rowIndex + 2; // 헤더(1행) + 0-based index 보정
  const range = `${CONFIG.SHEET_NAME}!A${sheetRow}:I${sheetRow}`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/${range}?valueInputOption=USER_ENTERED`;

  // 컬럼 순서: 출원번호, 발명의 명칭, 상태, 카테고리, 메모내용, 작성자, 수정일시, 작성일시, memo_id
  const body = {
    values: [[
      memoData['출원번호'],
      memoData['발명의 명칭'] || memoData['발명의_명칭'] || '',
      memoData['상태'],
      memoData['카테고리'],
      memoData['메모내용'],
      memoData['작성자'],
      formatDateTime(new Date()),    // 수정일시 갱신
      memoData['작성일시'],
      memoData['memo_id']
    ]]
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`수정 실패: ${res.status}`);
  return res.json();
}

/**
 * 메모 삭제 (행 내용 비우기)
 * @param {number} rowIndex - getAllMemos()에서 받은 _rowIndex
 * @returns {Object} API 응답
 */
async function deleteMemo(rowIndex) {
  const spreadsheetId = getSpreadsheetId();
  const token = await getAccessToken();
  const sheetRow = rowIndex + 2;
  const range = `${CONFIG.SHEET_NAME}!A${sheetRow}:I${sheetRow}`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/${range}?valueInputOption=USER_ENTERED`;

  const body = {
    values: [['', '', '', '', '', '', '', '', '']]
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`삭제 실패: ${res.status}`);
  return res.json();
}

/**
 * 메모가 있는 출원번호 Set 반환
 * @returns {Set<string>}
 */
async function getPatentsWithMemo() {
  const memos = await getAllMemos();
  return new Set(memos.map(m => m['출원번호']));
}

/**
 * 스프레드시트 연결 테스트
 * 지정된 Spreadsheet ID로 접근 가능한지 확인합니다.
 * @param {string} spreadsheetId - 테스트할 Spreadsheet ID
 * @returns {Object} { success, sheetTitle, memoCount }
 */
async function testConnection(spreadsheetId) {
  const token = await getAccessToken();

  // 1) 스프레드시트 메타 정보 조회
  const metaUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `?fields=properties.title,sheets.properties.title`;
  const metaRes = await fetch(metaUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!metaRes.ok) {
    if (metaRes.status === 404) throw new Error('스프레드시트를 찾을 수 없습니다. ID를 확인하세요.');
    if (metaRes.status === 403) throw new Error('접근 권한이 없습니다. 스프레드시트 공유 설정을 확인하세요.');
    throw new Error(`연결 실패: ${metaRes.status}`);
  }

  const meta = await metaRes.json();
  const sheetTitle = meta.properties.title;

  // 2) patent_memo 시트 존재 확인
  const sheetNames = meta.sheets.map(s => s.properties.title);
  if (!sheetNames.includes(CONFIG.SHEET_NAME)) {
    throw new Error(
      `"${CONFIG.SHEET_NAME}" 시트를 찾을 수 없습니다.\n` +
      `존재하는 시트: ${sheetNames.join(', ')}\n` +
      `스프레드시트에 "${CONFIG.SHEET_NAME}" 시트를 만들어주세요.`
    );
  }

  // 3) 메모 건수 확인
  const dataUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/${CONFIG.SHEET_NAME}`;
  const dataRes = await fetch(dataUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await dataRes.json();
  const memoCount = data.values ? Math.max(0, data.values.length - 1) : 0;

  return { success: true, sheetTitle, memoCount };
}

/**
 * Date → 'yyyy.MM.dd HH:mm:ss' 형식 문자열
 * @param {Date} d
 * @returns {string}
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
