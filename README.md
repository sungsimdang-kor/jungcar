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
3. Apps Script의 `프로젝트 설정 > 스크립트 속성`에 아래 2개 값을 저장합니다.
   - `AUTH_USERNAME`
   - `AUTH_PASSWORD_SHA256`
   - 추가 계정은 `AUTH_USERS_JSON`에 `{"아이디":"SHA-256 해시"}` 형식으로 저장합니다.
4. 웹앱으로 배포하고 실행 권한을 본인, 접근 권한을 필요한 범위로 설정합니다.
5. 사이트 로그인 화면에 웹앱 URL, 아이디, 비밀번호를 입력합니다.
