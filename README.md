# DECISION BRIDGE 특허 메모 Extension

DECISION BRIDGE 대시보드의 보유 특허에 메모를 추가하고 관리하는 Tableau Cloud Extension입니다.
Google Sheets를 저장소로 사용하며, 고객사가 추가되어도 코드 수정 없이 운영할 수 있습니다.

## 주요 기능

- **메모 추가**: 대시보드에서 특허 선택 후 팝업으로 메모 입력
- **메모 목록**: 전체 메모를 검색, 필터(카테고리/상태/작성자)로 조회
- **인라인 수정/삭제**: 메모 목록에서 바로 수정 및 삭제
- **양방향 연동**: Tableau에서 입력한 메모는 Google Sheets에 즉시 반영, Google Sheets에서 직접 입력한 메모는 Tableau에서 조회 가능
- **고객사별 독립 운영**: 대시보드마다 [설정] 버튼에서 스프레드시트를 연결하므로, 고객사 추가 시 코드 수정 불필요

## 구조

```
memo-extension/
├── manifest.trex              Tableau Extension 매니페스트
├── index.html                 대시보드 삽입 UI (버튼 + 선택 정보)
├── dialog.html                메모 입력 팝업 (displayDialogAsync)
├── memo-list.html             메모 목록/검색/수정/삭제 팝업
├── settings.html              고객사 스프레드시트 연결 설정 팝업
├── google-apps-script.js      Google Sheets 자동 채번 스크립트 (Apps Script용)
├── css/
│   └── style.css              공통 스타일
└── js/
    ├── config.js              설정값 (OAuth Client ID, 옵션 목록)
    ├── sheets-api.js          Google Sheets API CRUD + OAuth 인증
    ├── index.js               메인: 마크 선택 감지, 팝업 호출
    ├── dialog.js              메모 입력/저장 로직
    ├── memo-list.js           목록 조회/검색/필터/수정/삭제
    └── settings.js            고객사 스프레드시트 연결/테스트/저장
```

## 동작 흐름

```
Tableau 대시보드
├── 보유특허목록에서 특허 클릭
├── [메모 추가] → 팝업에서 입력 → Google Sheets에 저장
├── [메모 목록] → 팝업에서 조회/검색/수정/삭제
└── [설정]     → 팝업에서 고객사 스프레드시트 연결

Google Sheets
├── Tableau에서 입력한 메모 즉시 확인
├── 직접 메모 입력 가능 (출원번호 입력 시 발명의 명칭 자동 표시)
└── memo_id, 수정일시, 작성일시 자동 채번
```

## Google Sheets 컬럼 구조

| 열 | 컬럼명 | 입력 방법 |
|----|--------|----------|
| A | 출원번호 | 직접 입력 또는 드롭다운 선택 |
| B | 발명의 명칭 | 자동 (출원번호 입력 시 조회) |
| C | 상태 | 드롭다운 (진행중/완료/보류) |
| D | 카테고리 | 드롭다운 (기술이전검토/기업컨택/후속조치/기타) |
| E | 메모내용 | 직접 입력 |
| F | 작성자 | 직접 입력 |
| G | 수정일시 | 자동 |
| H | 작성일시 | 자동 |
| I | memo_id | 자동 (숨김) |

## 고객사 추가 절차

코드 수정 없이 아래 작업만 반복합니다.

1. 템플릿 스프레드시트 **사본 만들기** → 고객사 이름으로 변경
2. `patent_list` 시트에 해당 고객사의 `patent_KR.csv` 가져오기
3. 스프레드시트 **공유 설정** (편집자 권한)
4. Tableau 대시보드에서 **[설정]** → 스프레드시트 주소 붙여넣기 → 연결 테스트 → 저장

## 사전 요구사항

- Tableau Cloud 또는 Tableau Server 2021.4 이상
- Google Cloud 프로젝트 (Google Sheets API 활성화 + OAuth 클라이언트 ID)
- HTTPS 호스팅 (GitHub Pages 등)

## 설정 및 배포

상세한 설정 및 배포 절차는 [SETUP_GUIDE.md](SETUP_GUIDE.md)를 참고하세요.
초기 세팅(1~5단계)은 최초 1회만 수행하고, 이후 고객사 추가는 6단계만 반복합니다.

## 기술 스택

- Tableau Extensions API 1.7+
- Google Sheets API v4
- Google Identity Services (OAuth 2.0)
- Vanilla JavaScript (프레임워크 미사용)
