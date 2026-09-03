# Jungcar CRM

중카TV 고객관리 Numbers 최신 파일을 기준으로 만든 GitHub Pages용 정적 HTML 대시보드입니다.

## 구성

- `index.html`: 정적 사이트 진입점
- `app.js`: 고객 DB, 분석, CRUD, Google Sheets 동기화 로직
- `styles.css`: 대시보드 스타일
- `data/leads.json`: 공개 저장소 보호용 빈 데이터 파일
- `apps-script.js`: Google Sheets Apps Script에 붙여넣는 로그인/연동 템플릿 코드

## Google Sheets 연동

1. 구글 스프레드시트에서 `확장 프로그램 > Apps Script`를 엽니다.
2. `apps-script.js` 내용을 붙여넣습니다.
3. Apps Script의 인증 설정과 웹앱 배포를 완료합니다.
4. 사이트는 `Jungcar CRM 고객DB 최종`에 연결된 고정 웹앱 주소를 사용합니다.
5. 로그인 화면에서는 운영 계정의 비밀번호만 입력합니다.

## 저장 안전 장치

- 상담 기록은 고유한 `사이트ID`로 재시도하여, 응답이 느려져도 동일한 행이 중복 생성되지 않습니다.
- 사이트는 제출 내용을 브라우저의 임시 안전 저장소에 먼저 보관합니다.
- Apps Script가 구글시트에 쓴 값을 다시 읽어 일치를 확인한 후에만 저장 완료로 표시합니다.
- 네트워크가 끊기면 미확인 기록을 보관하고, 다음 로그인 또는 온라인 복귀 시 동일한 ID로 다시 확인합니다.
- 동시 저장은 Apps Script 잠금으로 순서대로 처리됩니다.

## 배포 순서

저장 확인 응답 형식이 프론트엔드와 백엔드에서 함께 바뀌므로, 다음 순서를 지켜야 합니다.

1. `apps-script.js`를 Apps Script 프로젝트에 반영하고 새 웹앱 버전으로 배포합니다.
2. 운영 시트와 별도의 테스트 행에서 새로 추가·수정·재시도·삭제를 확인합니다.
3. 그런 다음 GitHub Pages 사이트를 배포합니다.
