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
