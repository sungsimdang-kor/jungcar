# Jungcar CRM

중카TV 고객 관리 대시보드. 화면은 기존 GitHub Pages에서 제공하고 상담 데이터는 Firebase Firestore에 저장합니다.

## 구성

- `index.html`: 정적 사이트 진입점
- `app.js`: 고객 DB, 분석, 상담 입력 및 설정
- `styles.css`: 대시보드 스타일
- `data/leads.json`: 공개 저장소 보호용 빈 데이터 파일
- `firebase-client.mjs`: 인증, 실시간 구독, 서버 확인 기반 저장
- `firebase-model.mjs`: 버전 충돌 검사 및 중복 재시도 방지
- `firebase-config.js`: 공개 웹 앱 설정 (비밀번호나 관리자 키 없음)
- `firestore.rules`: 허가된 직원만 데이터에 접근하는 보안 규칙
- `apps-script.js`: 이전 시스템 참고용이며 현재 사이트에서 사용하지 않음

## 로그인

운영 아이디는 `admin`이며 기존과 같이 비밀번호만 입력합니다. 비밀번호는 Firebase Authentication에서 검증하며 HTML에 포함하지 않습니다. Google 계정 로그인은 사용하지 않습니다.

## 저장 안전 장치

- Firebase 서버에서 확인한 데이터만 표시하고 서버가 저장을 확인해야 완료로 처리합니다.
- 연결 오류 시 입력은 브라우저의 미확인 저장함에 남습니다. 재시도는 같은 기록 ID를 사용합니다.
- 동시 수정은 버전 충돌로 알리며 기존 기록을 조용히 덮어쓰지 않습니다.
- 수정 이력과 삭제 표시를 보존합니다. 원본 가져오기 자료는 클라이언트에서 접근할 수 없습니다.
- 설정에서 CSV/JSON 및 미확인 입력을 백업할 수 있습니다. 정기 자동 백업은 별도 설정이 필요합니다.

## 검증과 배포

`node --test tests/firebase-*.test.mjs`로 저장 모델과 연결 어댑터를 검증합니다.
GitHub Pages에는 공개 정적 파일을 배포하며 고객 원본, 개인 백업, 관리자 인증 파일은 포함하지 않습니다.
