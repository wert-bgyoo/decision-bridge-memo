/**
 * dialog.js — 메모 입력 팝업 로직
 *
 * displayDialogAsync로 열리며, initializeDialogAsync로 payload 수신
 * 저장 후 closeDialog('saved')로 결과 전달
 */

(async () => {
  // ── Tableau 팝업 초기화 (payload = 출원번호) ──
  const payload = await tableau.extensions.initializeDialogAsync();

  // settings에서 선택된 특허 상세 정보 가져오기
  const patentData = JSON.parse(
    tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.SELECTED_PATENT) || '{}'
  );

  const 출원번호 = patentData['출원번호'] || payload;
  const 발명의_명칭 = patentData['발명의_명칭'] || '';
  const grade = patentData['grade'] || '';

  // ── 특허 정보 표시 ──
  document.getElementById('patentNum').textContent = 출원번호;
  document.getElementById('patentTitle').textContent = 발명의_명칭;
  if (grade) {
    const gradeEl = document.getElementById('patentGrade');
    gradeEl.textContent = `등급: ${grade}`;
    gradeEl.style.display = 'inline-block';
  }

  // ── 폼 옵션 동적 생성 ──
  populateSelect('category', CONFIG.CATEGORIES);
  populateSelect('status', CONFIG.STATUSES);
  populateAuthorSelect();


  // ── 기존 메모 로드 ──
  await loadExistingMemos(출원번호);

  // ── 저장 버튼 ──
  document.getElementById('btnSave').addEventListener('click', async () => {
    const memoContent = document.getElementById('memoContent').value.trim();
    if (!memoContent) {
      alert('메모 내용을 입력하세요.');
      document.getElementById('memoContent').focus();
      return;
    }

    const btn = document.getElementById('btnSave');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      await addMemo({
        '출원번호': 출원번호,
        '발명의_명칭': 발명의_명칭,
        '상태': document.getElementById('status').value,
        '카테고리': document.getElementById('category').value,
        '메모내용': memoContent,
        '작성자': document.getElementById('author').value
      });

      // 토스트 표시 후 팝업 닫기
      const toast = document.getElementById('toast');
      toast.classList.add('show');
      setTimeout(() => {
        tableau.extensions.ui.closeDialog('saved');
      }, 700);
    } catch (err) {
      alert('저장 실패: ' + err.message);
      btn.disabled = false;
      btn.textContent = '저장';
    }
  });

  // ── 취소 버튼 ──
  document.getElementById('btnCancel').addEventListener('click', () => {
    tableau.extensions.ui.closeDialog('cancelled');
  });

  // ── Ctrl+Enter로 저장 ──
  document.getElementById('memoContent').addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      document.getElementById('btnSave').click();
    }
  });
})();

/**
 * 기존 메모 로드 및 표시
 */
async function loadExistingMemos(출원번호) {
  try {
    const memos = await getMemosByPatent(출원번호);
    if (memos.length === 0) return;

    const container = document.getElementById('existingMemos');
    const list = document.getElementById('existingMemoList');

    list.innerHTML = memos.map(m => `
      <div class="existing-memo-item">
        <div>${escapeHtml(m['메모내용'])}</div>
        <div class="meta">
          ${m['카테고리']} · ${m['상태']} · ${m['작성자']} · ${formatDate(m['수정일시'])}
        </div>
      </div>
    `).join('');

    container.style.display = 'block';
  } catch (e) {
    console.warn('기존 메모 로드 실패:', e);
  }
}

/**
 * select 요소에 옵션 채우기
 */
function populateSelect(elementId, options) {
  const el = document.getElementById(elementId);
  el.innerHTML = '';
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    el.appendChild(option);
  });
}

/**
 * 작성자 select 채우기
 * AUTHORS가 비어있으면 자유 입력용 input으로 대체
 */
function populateAuthorSelect() {
  const container = document.getElementById('author').parentElement;

  if (CONFIG.AUTHORS.length === 0) {
    // 작성자 목록이 없으면 텍스트 입력으로 대체
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'author';
    input.className = 'form-input';
    input.placeholder = '작성자 이름';
    container.replaceChild(input, document.getElementById('author'));
  } else {
    populateSelect('author', CONFIG.AUTHORS);
  }
}

/**
 * HTML 이스케이프
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * ISO 날짜 → 읽기 쉬운 형식
 */
function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch {
    return isoStr;
  }
}
