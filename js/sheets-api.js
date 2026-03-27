/**
 * Google Sheets API 통신 모듈
 *
 * Google Apps Script 웹앱을 JSONP 방식으로 호출합니다.
 * JSONP는 CORS 제한을 완전히 우회하므로 Tableau 내장 브라우저에서도 작동합니다.
 * OAuth 로그인 불필요 — 웹앱이 인증을 대신 처리합니다.
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
 * JSONP 방식으로 웹앱 호출 (CORS 우회)
 *
 * <script> 태그를 동적으로 삽입하여 웹앱을 호출합니다.
 * 웹앱은 callback(data) 형태로 응답하므로 교차 출처 제한이 없습니다.
 */
function callWebapp(params) {
  return new Promise(function(resolve, reject) {
    // 고유한 콜백 함수 이름 생성
    var cbName = '_memo_cb_' + Math.random().toString(36).substr(2, 9);

    // 타임아웃 (15초)
    var timer = setTimeout(function() {
      cleanup();
      reject(new Error('웹앱 응답 시간 초과 (15초)'));
    }, 15000);

    // 정리 함수
    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      var el = document.getElementById(cbName);
      if (el) el.parentNode.removeChild(el);
    }

    // 전역 콜백 함수 등록
    window[cbName] = function(data) {
      cleanup();
      if (data && data.error) {
        reject(new Error(data.error));
      } else {
        resolve(data);
      }
    };

    // URL 구성
    params.callback = cbName;
    var query = Object.keys(params)
      .map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(
          typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]
        );
      })
      .join('&');

    // <script> 태그 삽입 → 웹앱 호출
    var script = document.createElement('script');
    script.id = cbName;
    script.src = CONFIG.WEBAPP_URL + '?' + query;
    script.onerror = function() {
      cleanup();
      reject(new Error('웹앱에 연결할 수 없습니다. URL을 확인하세요.'));
    };
    document.body.appendChild(script);
  });
}

// ── CRUD 함수 ──

/**
 * 전체 메모 조회
 */
async function getAllMemos() {
  const spreadsheetId = getSpreadsheetId();
  const data = await callWebapp({
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
  return all.filter(function(m) { return m['출원번호'] === 출원번호; });
}

/**
 * 메모 추가
 */
async function addMemo(memoData) {
  const spreadsheetId = getSpreadsheetId();
  return callWebapp({
    action: 'add',
    spreadsheetId: spreadsheetId,
    data: memoData
  });
}

/**
 * 메모 수정
 */
async function updateMemo(memoId, memoData) {
  const spreadsheetId = getSpreadsheetId();
  return callWebapp({
    action: 'update',
    spreadsheetId: spreadsheetId,
    data: { memoId: memoId, memo: memoData }
  });
}

/**
 * 메모 삭제
 */
async function deleteMemo(memoId) {
  const spreadsheetId = getSpreadsheetId();
  return callWebapp({
    action: 'delete',
    spreadsheetId: spreadsheetId,
    data: { memoId: memoId }
  });
}

/**
 * 메모가 있는 출원번호 Set 반환
 */
async function getPatentsWithMemo() {
  const memos = await getAllMemos();
  return new Set(memos.map(function(m) { return m['출원번호']; }));
}

/**
 * 스프레드시트 연결 테스트
 */
async function testConnection(spreadsheetId) {
  return callWebapp({
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
  return Y + '.' + M + '.' + D + ' ' + h + ':' + m + ':' + s;
}
