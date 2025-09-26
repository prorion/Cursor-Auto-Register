# 🎯 Cursor 자동 회원가입 Chrome Extension 사용 가이드

## 📋 개요
이 Chrome Extension은 Go 프로그램과 연동하여 Cursor.com 회원가입을 자동으로 처리합니다.

## 🚀 설치 방법

### 1단계: Chrome Extension 설치

1. **Chrome 브라우저**를 열고 `chrome://extensions/` 로 이동
2. 우측 상단의 **"개발자 모드"** 토글을 **ON**으로 설정
3. **"압축해제된 확장 프로그램을 로드합니다"** 버튼 클릭
4. `cursor-extension` 폴더를 선택
5. Extension이 성공적으로 로드되면 브라우저 상단에 Extension 아이콘이 나타남

### 2단계: Go 프로그램 실행

```bash
# 프로젝트 디렉토리에서 실행
go run main.go database.go cursor.go email.go tm_mail.go playwright_cursor.go extension_server.go
```

## 📱 사용 방법

### 자동 모드 (권장)

1. **Go 프로그램 실행**
   ```
   선택하세요 (1-6): 4
   ```
   **"Chrome Extension 모드"** 선택

2. **임시 이메일 자동 생성**
   - Mail.tm API를 통해 임시 이메일 생성
   - 랜덤 이름과 비밀번호 자동 생성

3. **Chrome에서 cursor.com 접속**
   - 새 탭에서 https://cursor.com 으로 이동
   - Extension이 자동으로 회원가입 진행

4. **완료 대기**
   - Extension이 모든 폼을 자동으로 채움
   - 회원가입 완료 후 이메일 인증 확인

### 수동 제어 모드

Extension 팝업을 통해 수동으로 제어할 수도 있습니다:

1. **Extension 아이콘 클릭**
2. **서버 연결 상태 확인**
3. **"자동 회원가입 시작" 버튼 클릭**

## 🔧 트러블슈팅

### 문제 1: Extension 로드 실패
```
Solution: manifest.json 파일이 올바른지 확인
- manifest.json이 cursor-extension 폴더 내에 있는지 확인
- JSON 문법 오류가 없는지 확인
```

### 문제 2: Go 서버 연결 실패
```
Solution: HTTP 서버 포트 확인
- Go 프로그램이 정상 실행 중인지 확인
- http://localhost:8080/status 접속해서 서버 상태 확인
- 방화벽이 8080 포트를 차단하지 않는지 확인
```

### 문제 3: CAPTCHA 감지
```
Solution: CAPTCHA 수동 해결
- Extension이 CAPTCHA를 감지하면 알림 표시
- 수동으로 CAPTCHA를 해결한 후 진행
- 심한 경우 VPN 사용 고려
```

### 문제 4: 요소 찾기 실패
```
Solution: 페이지 구조 변경 대응
- Cursor.com 페이지 구조가 변경되었을 수 있음
- 브라우저 개발자 도구(F12)로 실제 요소 확인
- content.js의 셀렉터를 업데이트
```

## 🛡️ 보안 및 주의사항

### 데이터 보호
- **임시 이메일만 사용**: 실제 개인 이메일 노출 없음
- **로컬 통신**: 모든 데이터는 localhost에서만 처리
- **자동 클리어**: 작업 완료 후 임시 데이터 자동 삭제

### 사용 제한
- **개인 학습 목적으로만 사용**
- **과도한 자동화 금지**: Cursor.com 서비스 약관 준수
- **봇 감지 시 중단**: CAPTCHA 등이 나타나면 수동 처리

## 📊 Extension 기능

### 자동 처리 기능
- ✅ Sign in 버튼 자동 클릭
- ✅ Sign up 링크 자동 클릭  
- ✅ 회원가입 폼 자동 입력
- ✅ 비밀번호 자동 입력
- ✅ CAPTCHA 자동 감지
- ✅ 에러 발생 시 알림

### 안전 기능
- 🛡️ 여러 셀렉터로 안정적 요소 찾기
- 🛡️ 자연스러운 타이핑 시뮬레이션
- 🛡️ 랜덤 지연 시간
- 🛡️ 에러 발생 시 안전 중단

## 🔍 디버깅

### Chrome DevTools 사용
1. `F12`로 개발자 도구 열기
2. **Console** 탭에서 Extension 로그 확인
3. Extension 관련 메시지는 `🎭` 아이콘으로 표시

### 로그 확인
```javascript
// Extension 동작 로그
console.log('🎭 Cursor 자동 회원가입 확장프로그램이 실행되었습니다!');
console.log('✅ Sign in 버튼을 찾았습니다!');
console.log('📝 회원가입 폼을 자동으로 채웁니다...');
```

## 📞 지원

### 문제 발생 시
1. **브라우저 콘솔** 로그 확인
2. **Go 프로그램** 출력 메시지 확인
3. **네트워크 연결** 상태 확인
4. 필요 시 **Extension 재설치**

### 업데이트
- Extension 파일 수정 후 Chrome에서 **새로고침** 버튼 클릭
- Go 프로그램 수정 후 **재실행**

---

## 🎉 성공적인 사용을 위한 팁

1. **안정적인 인터넷 연결** 유지
2. **Chrome 브라우저 최신 버전** 사용
3. **방화벽/백신 소프트웨어** 예외 설정
4. **Cursor.com 서버 상태** 확인
5. **과도한 반복 사용 지양**