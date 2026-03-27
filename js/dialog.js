/**
 * dialog.js — 메모 입력 팝업 로직
 *
 * 단일 특허 또는 다중 특허 선택 시 모두 지원합니다.
 * 다중 선택 시 동일한 메모를 선택된 모든 특허에 일괄 저장합니다.
 */

(async () => {
  // ── Tableau 팝업 초기화 (payload = 출원번호) ──
  const payload = await tableau.extensions.initializeDialogAsync();

  // settings에서 선택된 특허 정보 가져오기 (배열 또는 단일 객체)
  const raw = tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.SELECTED_PATENT) || '{}';
  const parsed = JSON.parse(raw);

  // 배열이면 다중 선택, 객체면 단일 선택 (호환성)
  const patents = Array.isArray(parsed) ? parsed : [parsed];

  // ── 특허 정보 표시 ──
  if (patents.length === 1) {
    // 단일 선택
    document.getElementById('patentNum').textContent = patents[0]['출원번호'] || payload;
    document.getElementById('patentTitle').textContent = patents[0]['발명의_명칭'] || '';
    if (patents[0]['grade']) {
      const gradeEl = document.getElementById('patentGrade');
      gradeEl.textContent = '등급: ' + patents[0]['grade'];
      gradeEl.style.display = 'inline-block';
    }
  } else {
    // 다중 선택
    document.getElementById('patentNum').textContent = patents.length + '건 선택';
    document.getElementById('patentTitle').innerHTML = patents
      .map(function(p) { return p['출원번호'] + ' ' + (p['발명의_명칭'] || ''); })
      .join('<br>');
    document.getElementById('patentTitle').style.maxHeight = '80px';
    document.getElementById('patentTitle').style.overflowY = 'auto';
    document.getElementById('patentTitle').style.fontSize = '11px';
  }

  // ── 폼 옵션 동적 생성 ──
  populateSelect('category', CONFIG.CATEGORIES);
  populateSelect('status', CONFIG.STATUSES);
  populateAuthorSelect();

  // ── 기존 메모 로드 (단일 선택 시만) ──
  if (patents.length === 1) {
    await loadExistingMemos(patents[0]['출원번호'] || payload);
  }

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

    if (patents.length === 1) {
      btn.textContent = '저장 중...';
    } else {
      btn.textContent = '저장 중... (0/' + patents.length + ')';
    }

    try {
      const category = document.getElementById('category').value;
      const author = document.getElementById('author').value;
      const status = document.getElementById('status').value;

      // 선택된 모든 특허에 동일한 메모 저장
      for (var i = 0; i < patents.length; i++) {
        if (patents.length > 1) {
          btn.textContent = '저장 중... (' + (i + 1) + '/' + patents.length + ')';
        }

        await addMemo({
          '출원번호': patents[i]['출원번호'],
          '발명의_명칭': patents[i]['발명의_명칭'] || '',
          '상태': status,
          '카테고리': category,
          '메모내용': memoContent,
          '작성자': author
        });
      }

      // 토스트 표시 후 팝업 닫기
      const toast = document.getElementById('toast');
      toast.textContent = patents.length === 1
        ? '저장되었습니다'
        : patents.length + '건 저장되었습니다';
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
 * 날짜 → 읽기 쉬운 형식
 */
function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0') + ' ' +
      String(d.getHours()).padStart(2,'0') + ':' +
      String(d.getMinutes()).padStart(2,'0');
  } catch (e) {
    return isoStr;
  }
}
