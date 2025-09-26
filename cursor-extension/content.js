// Cursor.com 자동 회원가입 Content Script
console.log('🎭 Cursor 자동 회원가입 확장프로그램이 실행되었습니다!');

class CursorAutoFill {
    constructor() {
        this.serverUrl = 'http://localhost:8080';
        this.isProcessing = false;
        this.isStopped = true; // 기본값을 중단 상태로 변경
        this.isStarted = false; // 시작 여부 플래그 추가
        this.serverConnected = false; // 서버 연결 상태
        this.statusWidget = null;
        this.statusText = null;
        this.controlButton = null; // stopButton → controlButton으로 변경
        this.currentTimeout = null;
        this.currentInterval = null;
        
        // 세션 관리
        this.sessionId = this.generateSessionId();
        this.isMainTab = window.location.hostname === 'cursor.com' && window.location.pathname === '/';
        this.isDashboardTab = window.location.hostname === 'cursor.com' && window.location.pathname === '/dashboard';
        this.isAuthenticatorTab = window.location.hostname === 'authenticator.cursor.sh';
        this.hasCompletedSignIn = false; // Sign in 완료 여부
        
        // 중앙제어 시스템
        this.centralControlEnabled = true; // 중앙제어 모드 활성화
        this.currentStep = null; // 현재 실행 중인 단계
        this.stepExecutionInterval = null; // 단계 실행 인터벌
        this.lastReportedState = null; // 마지막으로 보고한 상태
        
        // 탭 간 상태 공유
        this.currentStepNumber = 0; // 현재 단계 번호 (0: 초기, 1: Step1 완료, 2: Step2 완료, 3: Step3 완료)
        this.emailGenerated = false; // 이메일 생성 여부
        this.userData = null; // 사용자 데이터
        
        this.init();
        this.createStatusWidget();
    }

    // 상태를 Chrome Storage에 저장
    async saveState() {
        const state = {
            currentStepNumber: this.currentStepNumber,
            emailGenerated: this.emailGenerated,
            userData: this.userData,
            timestamp: Date.now()
        };
        
        try {
            await chrome.storage.local.set({ 'cursorAutoFillState': state });
            console.log('💾 상태 저장됨:', state);
        } catch (error) {
            console.error('❌ 상태 저장 실패:', error);
        }
    }

    // Chrome Storage에서 상태 복원
    async loadState() {
        try {
            const result = await chrome.storage.local.get(['cursorAutoFillState']);
            if (result.cursorAutoFillState) {
                const state = result.cursorAutoFillState;
                
                // 1시간 이내의 상태만 복원 (오래된 상태는 무시)
                if (Date.now() - state.timestamp < 3600000) {
                    this.currentStepNumber = state.currentStepNumber || 0;
                    this.emailGenerated = state.emailGenerated || false;
                    this.userData = state.userData || null;
                    
                    console.log('📥 상태 복원됨:', state);
                    return true;
                } else {
                    console.log('⏰ 저장된 상태가 너무 오래됨, 초기화');
                    await this.clearState();
                }
            }
        } catch (error) {
            console.error('❌ 상태 복원 실패:', error);
        }
        return false;
    }

    // 저장된 상태 삭제
    async clearState() {
        try {
            await chrome.storage.local.remove(['cursorAutoFillState']);
            console.log('🗑️ 상태 삭제됨');
        } catch (error) {
            console.error('❌ 상태 삭제 실패:', error);
        }
    }

    async init() {
        // 저장된 상태 복원
        await this.loadState();
        
        // Background Script 메시지 수신 리스너
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('📨 메시지 수신:', message);
            
            // 단계별 실행 메시지 처리
            if (message.type === 'EXECUTE_STEP') {
                this.handleStepExecution(message);
            }
            // 기존 자동화 메시지들 (주석 처리됨)
            /*
            else if (message.type === 'NEW_AUTH_TAB_READY') {
                this.handleNewAuthTab(message.url, message.tabId);
            } else if (message.type === 'AUTO_START_REQUESTED') {
                console.log('🚀 새 탭에서 자동 시작 요청됨');
                this.handleAutoStartRequest(message);
            }
            */
        });
        
        // 페이지 준비 상태만 확인 (자동 시작 안함)
        this.waitForPageReady();
    }

    // 단계별 실행 처리
    async handleStepExecution(message) {
        const { step, action } = message;
        console.log(`🎯 Step ${step} 실행: ${action}`);
        
        try {
            switch (action) {
                case 'CLICK_SIGN_IN':
                    await this.executeSignInClick();
                    break;
                case 'CLICK_SIGN_UP':
                    await this.executeSignUpClick();
                    break;
                case 'FILL_SIGNUP_FORM':
                    await this.executeFillSignupForm();
                    break;
                default:
                    console.log('❌ 알 수 없는 액션:', action);
            }
        } catch (error) {
            console.error(`❌ Step ${step} 실행 실패:`, error);
            this.updateStatus(`❌ Step ${step} 실패`, 'error');
        }
    }

    // 페이지 준비 상태 체크 및 초기화
    async waitForPageReady() {
        // 페이지가 완전히 로드될 때까지 대기
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        // 추가 1초 대기 (페이지 완전 로딩)
        await this.sleep(1000);
        
        // 서버 연결 확인 (자동 시작은 안함)
        await this.checkServerConnection();
    }

    // 서버 연결 상태 확인
    async checkServerConnection() {
        try {
            const response = await fetch(`${this.serverUrl}/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                this.serverConnected = true;
                console.log('✅ Go 서버 연결 성공');
                this.updateStatus('🟢 서버 연결됨 - 시작 대기', 'info');
                this.updateControlButton();
            } else {
                throw new Error('서버 응답 오류');
            }
        } catch (error) {
            this.serverConnected = false;
            console.log('❌ Go 서버 연결 실패:', error);
            this.updateStatus('🔴 서버 연결 실패', 'error');
            this.updateControlButton();
        }
    }

    // 새 인증 탭 처리 (메인 탭에서만 실행)
    handleNewAuthTab(url, tabId) {
        if (!this.isMainTab) {
            console.log('❌ 메인 탭이 아니므로 새 탭 처리 무시');
            return;
        }
        
        console.log('🔗 새 인증 탭 감지됨 (메인 탭에서):', url, 'Tab ID:', tabId);
        this.updateStatus('🔗 새 탭에서 인증 진행', 'info');
        this.showNotification(`새 탭에서 인증이 시작됩니다: ${url}`, 'info');
        this.hasCompletedSignIn = true; // Sign in 완료 표시
    }

    // 자동 시작 요청 처리 (새 탭에서만)
    handleAutoStartRequest(message) {
        console.log('🔗 원본 탭에서 자동 시작 요청:', message);
        
        // 새 탭(인증 탭)에서만 처리
        if (this.isMainTab) {
            console.log('❌ 메인 탭에서는 자동 시작 요청 무시');
            return;
        }
        
        // 인증 탭에서만 자동 시작 허용
        if (!this.isAuthenticatorTab) {
            console.log('❌ 인증 도메인이 아니므로 자동 시작 거부');
            return;
        }
        
        console.log('✅ 인증 탭에서 자동 시작 허용');
        
        // 서버가 연결된 상태에서만 자동 시작
        if (this.serverConnected) {
            this.updateStatus('🔗 원본 탭 연동됨', 'info');
            setTimeout(() => {
                this.startAutomation();
            }, 1000);
        } else {
            // 서버 연결을 다시 시도한 후 자동 시작
            this.checkServerConnection().then(() => {
                if (this.serverConnected) {
                    setTimeout(() => {
                        this.startAutomation();
                    }, 1000);
                }
            });
        }
    }

    // Step 1: Sign In 버튼 클릭
    async executeSignInClick() {
        console.log('🔘 Step 1: Sign In 버튼 클릭 실행');
        this.updateStatus('🔘 Sign In 버튼 찾는 중...', 'processing');
        
        // Sign In 버튼 찾기
        const signInSelectors = [
            'a[href="/api/auth/login"]',
            'a[href*="/dashboard"]',
            'a:contains("Sign in")',
            'button:contains("Sign in")',
            'a:has-text("Sign in")',
            '[data-testid*="signin"]',
            '[data-testid*="login"]'
        ];
        
        const signInBtn = this.findElementBySelectors(signInSelectors, 'Sign in 버튼');
        if (signInBtn) {
            this.updateStatus('✅ Sign In 버튼 클릭 중...', 'success');
            await this.sleep(1000 + Math.random() * 1000);
            this.clickElementSafely(signInBtn, 'Sign in 버튼');
            console.log('✅ Step 1 완료: Sign In 버튼 클릭됨');
        } else {
            throw new Error('Sign In 버튼을 찾을 수 없습니다');
        }
    }

    // Step 2: Sign Up 버튼 클릭
    async executeSignUpClick() {
        console.log('🔗 Step 2: Sign Up 버튼 클릭 실행');
        this.updateStatus('🔗 Sign Up 버튼 찾는 중...', 'processing');
        
        // Sign Up 버튼 찾기
        const signUpSelectors = [
            'a[href*="/sign-up"]:not([href*="google"])',
            'a[href*="/signup"]:not([href*="google"])',
            'a:contains("Sign up"):not(:contains("Google")):not(:contains("google"))',
            'button:contains("Sign up"):not(:contains("Google")):not(:contains("google"))',
            '[data-testid*="signup"]:not([data-testid*="google"])',
            'a[href*="email"]',
            'button[data-testid="signup-email"]'
        ];
        
        const signUpBtn = this.findElementBySelectors(signUpSelectors, 'Sign Up 버튼');
        if (signUpBtn) {
            this.updateStatus('✅ Sign Up 버튼 클릭 중...', 'success');
            await this.sleep(1000 + Math.random() * 1000);
            this.clickElementSafely(signUpBtn, 'Sign Up 버튼');
            console.log('✅ Step 2 완료: Sign Up 버튼 클릭됨');
        } else {
            throw new Error('Sign Up 버튼을 찾을 수 없습니다');
        }
    }

    // Step 3: 회원가입 폼 작성
    async executeFillSignupForm() {
        console.log('📝 Step 3: 회원가입 폼 작성 실행');
        this.updateStatus('📝 회원가입 폼 작성 중...', 'processing');
        
        // 서버에서 사용자 데이터 가져오기
        const userData = await this.getUserData();
        if (!userData) {
            throw new Error('사용자 데이터를 가져올 수 없습니다');
        }

        console.log('👤 받은 사용자 데이터:', userData);

        // First Name 입력
        const firstNameSelectors = [
            'input[name="first_name"]',
            'input[name="firstName"]',
            'input[placeholder*="First name" i]',
            'input[data-testid*="first" i]'
        ];
        await this.typeInFieldBySelectors(firstNameSelectors, userData.firstName, '이름');
        
        // Last Name 입력
        const lastNameSelectors = [
            'input[name="last_name"]',
            'input[name="lastName"]',
            'input[placeholder*="Last name" i]',
            'input[data-testid*="last" i]'
        ];
        await this.typeInFieldBySelectors(lastNameSelectors, userData.lastName, '성');
        
        // Email 입력
        const emailSelectors = [
            'input[name="email"]',
            'input[type="email"]',
            'input[placeholder*="email" i]',
            'input[data-testid*="email" i]'
        ];
        await this.typeInFieldBySelectors(emailSelectors, userData.email, '이메일');
        
        // Continue 버튼 클릭
        const continueBtn = document.querySelector('button[name="intent"][value="sign-up"]');
        if (continueBtn) {
            await this.sleep(500 + Math.random() * 1000);
            continueBtn.click();
            console.log('✅ Continue 버튼 클릭 완료');
        }
        
        this.updateStatus('🎉 Step 3 완료!', 'success');
        console.log('✅ Step 3 완료: 회원가입 폼 작성됨');
    }

    /* 기존 자동화 코드들 (주석 처리됨)
    async startAutoFill() {
        // 서버 연결 확인
        if (!this.serverConnected) {
            console.log('❌ 서버가 연결되지 않아 자동화를 시작할 수 없습니다');
            this.updateStatus('🔴 서버 연결 필요', 'error');
            return;
        }
        
        // 시작되지 않았거나 중단된 상태면 실행하지 않음
        if (!this.isStarted || this.isStopped) {
            console.log('⏹️ 자동화가 시작되지 않았거나 중단된 상태입니다');
            return;
        }
        
        // 이미 처리 중이면 중복 실행 방지
        if (this.isProcessing) return;
        
        console.log('🔍 현재 페이지:', window.location.href);
        
        // 페이지 타입 감지 및 처리
        const currentUrl = window.location.href;
        console.log('🔍 URL 분석:', currentUrl);
        
        // 1. cursor.com 메인 페이지
        if (this.isMainTab) {
            this.handleMainPage();
        }
        // 2. cursor.com/dashboard 페이지 (리다이렉트 중간 단계)
        else if (this.isDashboardTab) {
            console.log('📄 Dashboard 페이지 감지됨 - 리다이렉트 대기');
            this.handleDashboardPage();
        }
        // 3. authenticator.cursor.sh 인증 페이지
        else if (this.isAuthenticatorTab) {
            console.log('🔐 Cursor 인증 페이지 감지됨');
            
            // 회원가입 폼이 이미 있는지 확인
            if (this.detectSignupForm()) {
                console.log('📝 회원가입 폼이 감지됨 - 바로 폼 채우기 시작');
                await this.handleSignupPage();
            } else {
                // Sign up 링크 찾기
                this.handleAuthenticatorPage();
            }
        }
        // 3. 로그인 페이지
        else if (currentUrl.includes('/api/auth/login') || currentUrl.includes('/login')) {
            this.handleLoginPage();
        }
        // 4. 회원가입 페이지 (URL 기반)
        else if (currentUrl.includes('/sign-up') || currentUrl.includes('/signup') || currentUrl.includes('/register')) {
            console.log('📝 회원가입 URL 감지됨');
            await this.handleSignupPage();
        }
        // 5. 기타 페이지에서 회원가입 폼 감지
        else if (this.detectSignupForm()) {
            console.log('📝 회원가입 폼이 페이지에서 감지됨');
            await this.handleSignupPage();
        }
        else {
            console.log('⚠️ 인식되지 않은 페이지:', currentUrl);
            this.updateStatus('⚠️ 인식되지 않은 페이지', 'error');
        }
    }
    */

    // ========== 중앙제어 시스템 ==========
    
    // 현재 페이지 상태를 서버에 보고
    async reportPageState() {
        if (!this.centralControlEnabled || !this.serverConnected) return;
        
        const pageState = {
            sessionId: this.sessionId,
            url: window.location.href,
            hostname: window.location.hostname,
            pathname: window.location.pathname,
            pageType: this.detectPageType(),
            availableElements: this.scanPageElements(),
            timestamp: Date.now(),
            isProcessing: this.isProcessing,
            currentStep: this.currentStep
        };
        
        // 상태가 변경된 경우만 보고
        if (JSON.stringify(pageState) === JSON.stringify(this.lastReportedState)) {
            return;
        }
        
        try {
            console.log('📡 서버에 페이지 상태 보고:', pageState);
            const response = await fetch(`${this.serverUrl}/report-state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pageState)
            });
            
            if (response.ok) {
                this.lastReportedState = pageState;
                console.log('✅ 상태 보고 성공');
            } else {
                console.log('❌ 상태 보고 실패:', response.status);
            }
        } catch (error) {
            console.log('❌ 상태 보고 오류:', error);
        }
    }
    
    // 서버로부터 다음 명령 받기
    async getNextCommand() {
        if (!this.centralControlEnabled || !this.serverConnected) return null;
        
        try {
            console.log('🎯 서버에서 다음 명령 요청...');
            const response = await fetch(`${this.serverUrl}/get-next-command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    url: window.location.href,
                    pageType: this.detectPageType(),
                    currentStep: this.currentStep
                })
            });
            
            if (response.ok) {
                const command = await response.json();
                console.log('📋 서버 명령 수신:', command);
                return command;
            } else {
                console.log('❌ 명령 요청 실패:', response.status);
                return null;
            }
        } catch (error) {
            console.log('❌ 명령 요청 오류:', error);
            return null;
        }
    }
    
    // 명령 실행 결과를 서버에 보고
    async reportCommandResult(command, success, result = null, error = null) {
        if (!this.centralControlEnabled || !this.serverConnected) return;
        
        try {
            const report = {
                sessionId: this.sessionId,
                commandId: command.id || command.type,
                command: command,
                success: success,
                result: result,
                error: error ? error.message : null,
                timestamp: Date.now(),
                url: window.location.href
            };
            
            console.log('📊 서버에 실행 결과 보고:', report);
            const response = await fetch(`${this.serverUrl}/report-result`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(report)
            });
            
            if (response.ok) {
                console.log('✅ 결과 보고 성공');
            } else {
                console.log('❌ 결과 보고 실패:', response.status);
            }
        } catch (error) {
            console.log('❌ 결과 보고 오류:', error);
        }
    }
    
    // 페이지 타입 감지
    detectPageType() {
        if (this.isMainTab) return 'main';
        if (this.isDashboardTab) return 'dashboard';
        if (this.isAuthenticatorTab) return 'authenticator';
        return 'unknown';
    }
    
    // 페이지의 주요 요소들 스캔
    scanPageElements() {
        const elements = {};
        
        // 버튼 요소들
        const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
        elements.buttons = Array.from(buttons).map((btn, index) => ({
            index: index,
            text: btn.textContent?.trim() || btn.value || '',
            type: btn.type || 'button',
            className: btn.className || '',
            id: btn.id || '',
            visible: btn.offsetParent !== null
        }));
        
        // 링크 요소들
        const links = document.querySelectorAll('a[href]');
        elements.links = Array.from(links).map((link, index) => ({
            index: index,
            text: link.textContent?.trim() || '',
            href: link.href || '',
            className: link.className || '',
            id: link.id || '',
            visible: link.offsetParent !== null
        }));
        
        // 입력 필드들
        const inputs = document.querySelectorAll('input, textarea, select');
        elements.inputs = Array.from(inputs).map((input, index) => ({
            index: index,
            name: input.name || '',
            type: input.type || 'text',
            placeholder: input.placeholder || '',
            className: input.className || '',
            id: input.id || '',
            visible: input.offsetParent !== null
        }));
        
        return elements;
    }
    
    // 서버 명령 실행
    async executeCommand(command) {
        if (!command || !this.centralControlEnabled) return false;
        
        console.log('🎯 명령 실행 시작:', command);
        this.currentStep = command.type;
        this.updateStatus(`🎯 ${command.description || command.type}`, 'processing');
        
        try {
            let result = null;
            
            switch (command.type) {
                case 'click':
                    result = await this.executeClickCommand(command);
                    break;
                case 'type':
                    result = await this.executeTypeCommand(command);
                    break;
                case 'wait':
                    result = await this.executeWaitCommand(command);
                    break;
                case 'navigate':
                    result = await this.executeNavigateCommand(command);
                    break;
                case 'check':
                    result = await this.executeCheckCommand(command);
                    break;
                case 'complete':
                    result = await this.executeCompleteCommand(command);
                    break;
                default:
                    throw new Error(`알 수 없는 명령 타입: ${command.type}`);
            }
            
            await this.reportCommandResult(command, true, result);
            console.log('✅ 명령 실행 성공:', command.type);
            return true;
            
        } catch (error) {
            console.log('❌ 명령 실행 실패:', error);
            await this.reportCommandResult(command, false, null, error);
            return false;
        }
    }
    
    // 클릭 명령 실행
    async executeClickCommand(command) {
        const { selector, index, text } = command;
        let element = null;
        
        if (selector) {
            element = document.querySelector(selector);
        } else if (typeof index === 'number') {
            if (command.elementType === 'button') {
                const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
                element = buttons[index];
            } else if (command.elementType === 'link') {
                const links = document.querySelectorAll('a[href]');
                element = links[index];
            }
        } else if (text) {
            // 텍스트로 요소 찾기
            const allElements = document.querySelectorAll('button, a, input[type="submit"], input[type="button"]');
            element = Array.from(allElements).find(el => 
                el.textContent?.trim().includes(text) || el.value?.includes(text)
            );
        }
        
        if (!element) {
            throw new Error(`클릭할 요소를 찾을 수 없음: ${JSON.stringify(command)}`);
        }
        
        if (element.offsetParent === null) {
            throw new Error('요소가 보이지 않음');
        }
        
        // 자연스러운 지연
        await this.sleep(command.delay || 1000 + Math.random() * 2000);
        
        element.focus();
        element.click();
        
        console.log('🖱️ 클릭 완료:', element.textContent?.trim() || element.value || element.tagName);
        return { clicked: true, element: element.tagName, text: element.textContent?.trim() };
    }
    
    // 입력 명령 실행
    async executeTypeCommand(command) {
        const { selector, index, name, value } = command;
        let element = null;
        
        if (selector) {
            element = document.querySelector(selector);
        } else if (typeof index === 'number') {
            const inputs = document.querySelectorAll('input, textarea, select');
            element = inputs[index];
        } else if (name) {
            element = document.querySelector(`input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`);
        }
        
        if (!element) {
            throw new Error(`입력 요소를 찾을 수 없음: ${JSON.stringify(command)}`);
        }
        
        if (element.offsetParent === null) {
            throw new Error('입력 요소가 보이지 않음');
        }
        
        // 기존 내용 지우기
        element.focus();
        element.click();
        element.select();
        
        // 자연스러운 타이핑
        element.value = '';
        for (let i = 0; i < value.length; i++) {
            element.value += value[i];
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await this.sleep(50 + Math.random() * 100); // 50-150ms per character
        }
        
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        console.log('⌨️ 입력 완료:', element.name || element.placeholder, '=', value);
        return { typed: true, element: element.name || element.placeholder, value: value };
    }
    
    // 대기 명령 실행
    async executeWaitCommand(command) {
        const duration = command.duration || 1000;
        console.log(`⏳ ${duration}ms 대기 중...`);
        await this.sleep(duration);
        return { waited: true, duration: duration };
    }
    
    // 네비게이션 명령 실행
    async executeNavigateCommand(command) {
        const { url } = command;
        console.log('🔗 페이지 이동:', url);
        window.location.href = url;
        return { navigated: true, url: url };
    }
    
    // 확인 명령 실행
    async executeCheckCommand(command) {
        const { condition, selector, text } = command;
        
        switch (condition) {
            case 'element_exists':
                const element = document.querySelector(selector);
                return { exists: !!element, selector: selector };
                
            case 'text_contains':
                const hasText = document.body.textContent.includes(text);
                return { contains: hasText, text: text };
                
            case 'url_contains':
                const urlMatch = window.location.href.includes(text);
                return { urlMatch: urlMatch, currentUrl: window.location.href };
                
            default:
                throw new Error(`알 수 없는 확인 조건: ${condition}`);
        }
    }
    
    // 완료 명령 실행
    async executeCompleteCommand(command) {
        console.log('🎉 자동화 완료:', command.message || '성공적으로 완료되었습니다');
        this.updateStatus('🎉 자동화 완료!', 'success');
        this.stopAutomation();
        return { completed: true, message: command.message };
    }

    // 세션 ID 생성
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // 현재 탭이 자동화를 실행해야 하는지 확인
    shouldRunAutomation() {
        console.log('🔍 자동화 실행 조건 검사:', {
            isMainTab: this.isMainTab,
            isDashboardTab: this.isDashboardTab,
            isAuthenticatorTab: this.isAuthenticatorTab,
            hostname: window.location.hostname,
            pathname: window.location.pathname,
            sessionId: this.sessionId
        });
        
        // 메인 탭(cursor.com)에서만 자동 시작 허용
        if (this.isMainTab) {
            console.log('✅ 메인 탭에서 자동화 시작 허용');
            return true;
        }
        
        // Dashboard 탭에서는 자동화 시작 금지 (리다이렉트 대기)
        if (this.isDashboardTab) {
            console.log('📄 Dashboard 탭 - 리다이렉트 대기 중');
            return false;
        }
        
        // 새 탭(authenticator.cursor.sh)에서는 명시적 시작 신호가 있을 때만
        if (this.isAuthenticatorTab) {
            console.log('🔐 인증 탭 감지 - 명시적 시작 신호 필요');
            return false; // Background Script 신호 대기
        }
        
        console.log('❌ 자동화 실행 조건 불충족');
        return false;
    }

    // 회원가입 폼 감지
    detectSignupForm() {
        console.log('🔍 회원가입 폼 감지 시도...');
        
        // 회원가입 폼 특징적인 요소들
        const signupFormIndicators = [
            // 이름 필드들
            'input[name="firstName"]',
            'input[name="first_name"]',
            'input[name="lastname"]',
            'input[name="last_name"]',
            'input[placeholder*="First name"]',
            'input[placeholder*="Last name"]',
            'input[placeholder*="이름"]',
            'input[placeholder*="성"]',
            
            // 이메일 + 비밀번호 조합
            'input[name="email"] + input[name="password"]',
            'input[type="email"] + input[type="password"]',
            
            // 특정 폼 구조
            'form[data-testid*="signup"]',
            'form[data-testid*="register"]',
            'div[data-testid*="signup"] input',
            'div[data-testid*="register"] input',
            
            // Continue/Submit 버튼과 함께 있는 경우
            'button:contains("Continue") + input[type="email"]',
            'button:contains("Sign up") + input[type="email"]'
        ];
        
        for (const selector of signupFormIndicators) {
            try {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`✅ 회원가입 폼 감지됨: ${selector}`);
                    return true;
                }
            } catch (e) {
                // CSS 셀렉터 오류는 무시
                continue;
            }
        }
        
        // 추가: First Name, Last Name, Email 필드가 모두 있는지 확인
        const firstNameField = document.querySelector('input[name*="first" i], input[placeholder*="first" i]');
        const lastNameField = document.querySelector('input[name*="last" i], input[placeholder*="last" i]');
        const emailField = document.querySelector('input[type="email"], input[name="email"]');
        
        if (firstNameField && lastNameField && emailField) {
            console.log('✅ 이름/성/이메일 필드 조합으로 회원가입 폼 감지됨');
            return true;
        }
        
        console.log('❌ 회원가입 폼을 찾을 수 없음');
        return false;
    }

    // cursor.com/dashboard 페이지 처리 (리다이렉트 중간 단계)
    handleDashboardPage() {
        if (this.isStopped || !this.isStarted) return;
        
        console.log('📄 Dashboard 페이지에서 리다이렉트 대기 중...');
        this.updateStatus('📄 리다이렉트 대기 중...', 'processing');
        
        // Dashboard 페이지에서는 특별한 작업을 하지 않고 리다이렉트를 기다림
        // authenticator.cursor.sh로 자동 리다이렉트될 때까지 대기
        
        // 만약 5초 후에도 리다이렉트가 되지 않으면 강제로 확인
        this.currentTimeout = setTimeout(() => {
            if (this.isStopped) return;
            
            if (window.location.hostname === 'cursor.com' && window.location.pathname === '/dashboard') {
                console.log('⚠️ Dashboard에서 리다이렉트가 예상보다 지연됨');
                this.updateStatus('⚠️ 리다이렉트 지연됨', 'processing');
                
                // 추가 10초 대기
                this.currentTimeout = setTimeout(() => {
                    if (this.isStopped) return;
                    if (window.location.hostname === 'cursor.com' && window.location.pathname === '/dashboard') {
                        console.log('❌ Dashboard 리다이렉트 실패');
                        this.forceStop('Dashboard 리다이렉트 시간 초과');
                    }
                }, 10000);
            }
        }, 5000);
    }

    // authenticator.cursor.sh 페이지 처리
    handleAuthenticatorPage() {
        if (this.isStopped || !this.isStarted) return;
        
        console.log('🔐 인증 페이지에서 Sign up 링크를 찾습니다...');
        this.updateStatus('🔐 Sign up 링크 찾는 중...', 'processing');
        
        // Sign up 링크 찾기 (authenticator 페이지용) - Google 버튼 제외
        const signUpSelectors = [
            'a[href*="sign-up"]:not([href*="google"])',
            'a[href*="signup"]:not([href*="google"])',
            'a[href*="register"]:not([href*="google"])',
            'a:contains("Sign up"):not(:contains("Google")):not(:contains("google"))',
            'a:contains("Create account"):not(:contains("Google")):not(:contains("google"))',
            'button:contains("Sign up"):not(:contains("Google")):not(:contains("google"))',
            '[data-testid*="signup"]:not([data-testid*="google"])',
            '[data-testid*="register"]:not([data-testid*="google"])',
            '.signup-link:not(.google)',
            '.register-link:not(.google)',
            // 이메일 회원가입 전용
            'a[href*="email"]',
            'button[data-testid="signup-email"]',
            '[data-testid="email-signup"]'
        ];
        
        const signUpLink = this.findElementBySelectors(signUpSelectors, 'Sign up 링크');
        if (signUpLink) {
            this.updateStatus('✅ Sign up 링크 클릭 중...', 'success');
            this.showNotification('Sign up 링크를 클릭합니다...', 'info');
            
            // 자연스러운 지연 후 클릭
            this.currentTimeout = setTimeout(() => {
                if (this.isStopped) return;
                
                this.clickElementSafely(signUpLink, 'Sign up 링크');
                
                // 클릭 후 페이지 전환 대기
                this.currentTimeout = setTimeout(() => {
                    if (this.isStopped) return;
                    this.updateStatus('⏳ 회원가입 페이지 로딩...', 'processing');
                    this.checkPageTransition();
                }, 2000);
            }, 1000 + Math.random() * 2000);
        } else {
            // 대안: 페이지의 모든 링크를 로깅해서 디버깅
            console.log('🔍 페이지의 모든 링크들:');
            const allLinks = document.querySelectorAll('a');
            allLinks.forEach((link, index) => {
                console.log(`Link ${index}:`, {
                    text: link.textContent?.trim(),
                    href: link.href,
                    innerHTML: link.innerHTML
                });
            });
            
            this.forceStop('Sign up 링크를 찾을 수 없음');
        }
    }

    handleMainPage() {
        if (this.isStopped || !this.isStarted) return;
        
        console.log('🏠 메인 페이지에서 Sign in 버튼을 찾습니다...');
        this.updateStatus('🏠 Sign in 버튼 찾는 중...', 'processing');
        
        // 여러 가능한 셀렉터로 Sign in 버튼 찾기
        const signInSelectors = [
            'a[href="https://cursor.com/dashboard"]',
            'a.btn--ghost.btn--sm[href="https://cursor.com/dashboard"]',
            'a[href*="/dashboard"]',
            'a[href="/api/auth/login"]',
            'a[href*="/login"]',
            'a:contains("Sign in")',
            'button:contains("Sign in")',
            'a:has-text("Sign in")',
            '[data-testid*="signin"]',
            '[data-testid*="login"]'
        ];
        
        let signInBtn = null;
        for (const selector of signInSelectors) {
            try {
                signInBtn = document.querySelector(selector);
                if (signInBtn) {
                    console.log(`✅ Sign in 버튼을 찾았습니다! (셀렉터: ${selector})`);
                    break;
                }
            } catch (e) {
                // 일부 셀렉터는 지원되지 않을 수 있음
                continue;
            }
        }
        
        if (signInBtn) {
            // 중복 클릭 방지
            if (this.hasCompletedSignIn) {
                console.log('⏭️ 이미 Sign in이 완료되어 중복 클릭 방지');
                this.updateStatus('⏭️ 이미 Sign in 완료됨', 'info');
                return;
            }
            
            this.updateStatus('✅ Sign in 버튼 클릭 중...', 'success');
            this.showNotification('Sign in 버튼을 클릭합니다...', 'info');
            
            // 새 탭 열림 감지를 위해 Background Script에 알림
            this.notifyBackgroundScript('SIGNIN_CLICKED');
            
            // 자연스러운 지연 후 클릭
            this.currentTimeout = setTimeout(() => {
                if (this.isStopped) return;
                
                this.clickElementSafely(signInBtn, 'Sign in 버튼');
                this.hasCompletedSignIn = true; // 클릭 완료 표시
                
                // 새 탭이 열릴 가능성이 있으므로 더 긴 대기시간
                this.currentTimeout = setTimeout(() => {
                    if (this.isStopped) return;
                    this.updateStatus('🔗 새 탭에서 로그인 진행...', 'processing');
                    this.showNotification('새 탭에서 로그인이 진행됩니다', 'info');
                    
                    // 메인 탭에서는 더 이상 처리하지 않음
                    this.stopAutomation();
                }, 3000);
            }, 1000 + Math.random() * 2000);
        } else {
            console.log('❌ Sign in 버튼을 찾을 수 없습니다');
            this.forceStop('Sign in 버튼을 찾을 수 없음');
        }
    }

    // 페이지 전환 감지 및 자동 진행
    checkPageTransition() {
        let attempts = 0;
        const maxAttempts = 15; // 15초 대기
        
        this.currentInterval = setInterval(() => {
            // 중단됨 확인
            if (this.isStopped) {
                clearInterval(this.currentInterval);
                return;
            }
            
            attempts++;
            
            if (window.location.href.includes('/dashboard') || 
                window.location.href.includes('/login') || 
                window.location.href.includes('/auth')) {
                
                clearInterval(this.currentInterval);
                this.updateStatus('🔐 로그인 페이지 도착', 'info');
                
                // 짧은 지연 후 Sign up 링크 찾기
                this.currentTimeout = setTimeout(() => {
                    if (!this.isStopped) {
                        this.handleLoginPage();
                    }
                }, 1000);
                
            } else if (window.location.href.includes('/sign-up')) {
                clearInterval(this.currentInterval);
                this.updateStatus('📝 회원가입 페이지 도착', 'info');
                
                this.currentTimeout = setTimeout(() => {
                    if (!this.isStopped) {
                        this.handleSignupPage();
                    }
                }, 1000);
                
            } else if (attempts >= maxAttempts) {
                clearInterval(this.currentInterval);
                console.log('페이지 전환을 감지하지 못했습니다.');
                this.forceStop('페이지 전환 시간 초과');
            }
        }, 1000);
    }

    handleLoginPage() {
        if (this.isStopped || !this.isStarted) return;
        
        console.log('🔐 로그인 페이지에서 Sign up 링크를 찾습니다...');
        this.updateStatus('🔐 Sign up 링크 찾는 중...', 'processing');
        
        // 여러 가능한 셀렉터로 Sign up 링크 찾기
        const signUpSelectors = [
            'a[href*="/sign-up"]',
            'a:contains("Sign up")',
            'a:has-text("Sign up")', 
            'button:contains("Sign up")',
            'a:contains("회원가입")',
            '[data-testid*="signup"]',
            '[data-testid*="register"]'
        ];
        
        const signUpLink = this.findElementBySelectors(signUpSelectors, 'Sign up 링크');
        if (signUpLink) {
            this.updateStatus('✅ Sign up 링크 클릭 중...', 'success');
            this.showNotification('Sign up 링크를 클릭합니다...', 'info');
            
            // 자연스러운 지연 후 클릭
            this.currentTimeout = setTimeout(() => {
                if (this.isStopped) return;
                
                this.clickElementSafely(signUpLink, 'Sign up 링크');
                // 클릭 후 페이지 전환 대기
                this.currentTimeout = setTimeout(() => {
                    if (this.isStopped) return;
                    this.updateStatus('⏳ 회원가입 페이지 로딩...', 'processing');
                    this.checkPageTransition();
                }, 2000);
            }, 1000 + Math.random() * 2000);
        } else {
            this.forceStop('Sign up 링크를 찾을 수 없음');
        }
    }

    async handleSignupPage() {
        if (this.isProcessing || this.isStopped || !this.isStarted) return;
        this.isProcessing = true;
        
        console.log('📝 회원가입 페이지에서 폼을 자동으로 채웁니다...');
        this.updateStatus('📝 회원가입 정보 가져오는 중...', 'processing');
        this.showNotification('회원가입 정보를 가져오는 중...', 'info');
        
        try {
            // Go 서버에서 회원가입 데이터 가져오기
            const userData = await this.getUserData();
            if (!userData) {
                throw new Error('사용자 데이터를 가져올 수 없습니다');
            }

            console.log('👤 받은 사용자 데이터:', userData);
            this.updateStatus('✅ 폼 자동 작성 중...', 'success');
            this.showNotification('폼을 자동으로 채웁니다...', 'success');

            // 폼 필드 채우기
            await this.fillForm(userData);
            
        } catch (error) {
            console.error('❌ 자동 폼 채우기 실패:', error);
            this.forceStop('폼 작성 실패: ' + error.message);
        } finally {
            this.isProcessing = false;
        }
    }

    async getUserData() {
        try {
            const response = await fetch(`${this.serverUrl}/get-user-data`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Go 서버 연결 실패:', error);
            return null;
        }
    }

    async fillForm(userData) {
        console.log('📝 폼 필드를 찾아서 채웁니다...');
        
        // First Name 입력 (다양한 필드명 지원)
        const firstNameSelectors = [
            'input[name="first_name"]',
            'input[name="firstName"]',
            'input[name="fname"]',
            'input[placeholder*="First name" i]',
            'input[placeholder*="이름" i]',
            'input[data-testid*="first" i]',
            'input[id*="first" i]'
        ];
        await this.typeInFieldBySelectors(firstNameSelectors, userData.firstName, '이름');
        
        // Last Name 입력 (다양한 필드명 지원)
        const lastNameSelectors = [
            'input[name="last_name"]',
            'input[name="lastName"]',
            'input[name="lname"]',
            'input[placeholder*="Last name" i]',
            'input[placeholder*="성" i]',
            'input[data-testid*="last" i]',
            'input[id*="last" i]'
        ];
        await this.typeInFieldBySelectors(lastNameSelectors, userData.lastName, '성');
        
        // Email 입력 (다양한 필드명 지원)
        const emailSelectors = [
            'input[name="email"]',
            'input[type="email"]',
            'input[placeholder*="email" i]',
            'input[placeholder*="이메일" i]',
            'input[data-testid*="email" i]',
            'input[id*="email" i]'
        ];
        await this.typeInFieldBySelectors(emailSelectors, userData.email, '이메일');
        
        // 첫 번째 Continue 버튼 클릭
        await this.clickContinueButton();
        
        // CAPTCHA 확인
        if (this.detectCaptcha()) {
            this.showNotification('⚠️ CAPTCHA가 감지되었습니다. 수동으로 해결해주세요.', 'error');
            return;
        }
        
        // 비밀번호 입력 필드가 나타날 때까지 대기
        const passwordField = await this.waitForPasswordField();
        
        // Password 입력
        await this.typeInField('input[name="password"]', userData.password, '비밀번호');
        
        // 두 번째 Continue 버튼 클릭
        await this.clickFinalContinueButton();
        
        this.updateStatus('🎉 회원가입 폼 완료!', 'success');
        this.showNotification('회원가입 폼 작성이 완료되었습니다!', 'success');
    }

    // 여러 선택자로 필드 찾아서 입력
    async typeInFieldBySelectors(selectors, value, fieldName) {
        let field = null;
        let usedSelector = '';
        
        // 선택자들을 순서대로 시도
        for (const selector of selectors) {
            try {
                field = document.querySelector(selector);
                if (field && field.offsetParent !== null) { // 보이는 필드만
                    usedSelector = selector;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!field) {
            console.log(`❌ ${fieldName} 필드를 찾을 수 없습니다. 시도한 선택자들:`, selectors);
            throw new Error(`${fieldName} 필드를 찾을 수 없습니다`);
        }

        console.log(`✏️ ${fieldName} 입력: ${value} (선택자: ${usedSelector})`);
        return await this.typeInFieldElement(field, value, fieldName);
    }

    async typeInField(selector, value, fieldName) {
        const field = document.querySelector(selector);
        if (!field) {
            throw new Error(`${fieldName} 필드를 찾을 수 없습니다 (${selector})`);
        }

        console.log(`✏️ ${fieldName} 입력: ${value}`);
        return await this.typeInFieldElement(field, value, fieldName);
    }

    async typeInFieldElement(field, value, fieldName) {
        
        // 필드 포커스
        field.focus();
        field.click();
        
        // 기존 내용 지우기
        field.value = '';
        
        // 사람처럼 한 글자씩 타이핑
        for (let i = 0; i < value.length; i++) {
            field.value += value[i];
            
            // input 이벤트 발생시키기 (React 등에서 필요)
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            
            // 타이핑 지연 (50-150ms)
            await this.sleep(50 + Math.random() * 100);
        }
        
        // 필드에서 포커스 제거
        field.blur();
        
        // 완료 후 잠시 대기
        await this.sleep(300 + Math.random() * 500);
    }

    async clickContinueButton() {
        console.log('🔘 첫 번째 Continue 버튼을 클릭합니다...');
        
        const continueBtn = document.querySelector('button[name="intent"][value="sign-up"]');
        if (!continueBtn) {
            throw new Error('Continue 버튼을 찾을 수 없습니다');
        }
        
        // 클릭 전 사고 시간
        await this.sleep(500 + Math.random() * 1000);
        
        continueBtn.click();
        console.log('✅ 첫 번째 Continue 버튼 클릭 완료');
    }

    async waitForPasswordField() {
        const passwordSelectors = [
            'input[name="password"]',
            'input[type="password"]',
            'input[placeholder*="password"]',
            'input[placeholder*="Password"]',
            'input[placeholder*="비밀번호"]',
            '[data-testid*="password"]'
        ];
        
        return await this.waitForElement(passwordSelectors, '비밀번호 필드', 15);
    }

    async clickFinalContinueButton() {
        console.log('🔘 최종 Continue 버튼을 클릭합니다...');
        
        const finalBtn = document.querySelector('button[name="intent"][value="sign-up"]');
        if (!finalBtn) {
            throw new Error('최종 Continue 버튼을 찾을 수 없습니다');
        }
        
        // 클릭 전 사고 시간
        await this.sleep(500 + Math.random() * 1000);
        
        finalBtn.click();
        console.log('✅ 최종 Continue 버튼 클릭 완료');
    }

    showNotification(message, type = 'info') {
        // 알림 요소 생성
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 300px;
            word-wrap: break-word;
            transition: all 0.3s ease;
        `;
        
        // 타입별 색상
        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#10b981';
                break;
            case 'error':
                notification.style.backgroundColor = '#ef4444';
                break;
            case 'info':
            default:
                notification.style.backgroundColor = '#3b82f6';
                break;
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // 3초 후 자동 제거
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 3000);
    }

    // 지속적인 상태 위젯 생성 (단계별 버튼 포함)
    createStatusWidget() {
        if (this.statusWidget) return;
        
        // DOM이 아직 준비되지 않은 경우 대기
        if (!document.body) {
            setTimeout(() => this.createStatusWidget(), 100);
            return;
        }
        
        // 메인 컨테이너
        this.statusWidget = document.createElement('div');
        this.statusWidget.id = 'cursor-extension-status';
        this.statusWidget.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10001;
            border-radius: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            font-weight: 600;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            min-width: 280px;
            max-width: 320px;
            border: 2px solid rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
            overflow: hidden;
        `;
        
        // 헤더 영역
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 15px 8px 15px;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;
        header.innerHTML = `
            <div style="font-size: 16px; margin-bottom: 4px;">🎭 Cursor 자동화</div>
            <div id="statusText" style="font-size: 11px; opacity: 0.8;">Extension 로드됨</div>
        `;
        
        // 이메일 생성 버튼
        this.emailButton = document.createElement('button');
        this.emailButton.textContent = '📧 임시 이메일 생성';
        this.emailButton.style.cssText = `
            width: calc(100% - 20px);
            margin: 10px;
            padding: 10px;
            background: rgba(16, 185, 129, 0.8);
            border: none;
            color: white;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s;
        `;
        this.emailButton.addEventListener('click', () => this.generateEmail());
        
        // 이메일 정보 표시 영역
        this.emailInfo = document.createElement('div');
        this.emailInfo.style.cssText = `
            margin: 10px;
            padding: 8px;
            background: rgba(0,0,0,0.2);
            border-radius: 6px;
            font-size: 10px;
            display: none;
        `;
        
        // 단계별 버튼 컨테이너
        this.stepButtonsContainer = document.createElement('div');
        this.stepButtonsContainer.style.cssText = `
            padding: 10px;
            border-top: 1px solid rgba(255,255,255,0.1);
            display: none;
        `;
        
        // Step 1 버튼
        this.step1Button = document.createElement('button');
        this.step1Button.textContent = '1️⃣ Sign In 클릭';
        this.step1Button.style.cssText = `
            width: 100%;
            margin-bottom: 8px;
            padding: 8px;
            background: rgba(59, 130, 246, 0.8);
            border: none;
            color: white;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s;
        `;
        this.step1Button.addEventListener('click', () => this.executeStep1());
        
        // Step 2 버튼
        this.step2Button = document.createElement('button');
        this.step2Button.textContent = '2️⃣ Sign Up 클릭';
        this.step2Button.disabled = true;
        this.step2Button.style.cssText = `
            width: 100%;
            margin-bottom: 8px;
            padding: 8px;
            background: rgba(107, 114, 128, 0.5);
            border: none;
            color: white;
            font-size: 11px;
            font-weight: 600;
            cursor: not-allowed;
            border-radius: 4px;
            transition: all 0.2s;
            opacity: 0.6;
        `;
        this.step2Button.addEventListener('click', () => this.executeStep2());
        
        // Step 3 버튼
        this.step3Button = document.createElement('button');
        this.step3Button.textContent = '3️⃣ 폼 작성';
        this.step3Button.disabled = true;
        this.step3Button.style.cssText = `
            width: 100%;
            margin-bottom: 8px;
            padding: 8px;
            background: rgba(107, 114, 128, 0.5);
            border: none;
            color: white;
            font-size: 11px;
            font-weight: 600;
            cursor: not-allowed;
            border-radius: 4px;
            transition: all 0.2s;
            opacity: 0.6;
        `;
        this.step3Button.addEventListener('click', () => this.executeStep3());
        
        // 버튼들을 컨테이너에 추가
        this.stepButtonsContainer.appendChild(this.step1Button);
        this.stepButtonsContainer.appendChild(this.step2Button);
        this.stepButtonsContainer.appendChild(this.step3Button);
        
        // 닫기 버튼
        const closeButton = document.createElement('button');
        closeButton.textContent = '✖️';
        closeButton.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            width: 20px;
            height: 20px;
            background: rgba(239, 68, 68, 0.8);
            border: none;
            color: white;
            font-size: 10px;
            cursor: pointer;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        closeButton.addEventListener('click', () => {
            this.statusWidget.style.display = 'none';
        });
        
        // 모든 요소들을 메인 컨테이너에 추가
        this.statusWidget.appendChild(header);
        this.statusWidget.appendChild(this.emailButton);
        this.statusWidget.appendChild(this.emailInfo);
        this.statusWidget.appendChild(this.stepButtonsContainer);
        this.statusWidget.appendChild(closeButton);
        
        // statusText 참조 업데이트
        this.statusText = document.getElementById('statusText');
        
        document.body.appendChild(this.statusWidget);
        
        // 복원된 상태에 따라 UI 업데이트 (비동기)
        setTimeout(() => this.updateUIFromState(), 500);
        
        // 서버 연결 확인
        this.checkServerConnection();
    }

    // 복원된 상태에 따라 UI 업데이트
    async updateUIFromState() {
        if (!this.emailGenerated || this.currentStepNumber === 0) {
            // 초기 상태: 이메일 생성 버튼만 표시
            return;
        }

        // 저장된 사용자 데이터가 없으면 서버에서 가져오기
        if (!this.userData && this.emailGenerated) {
            try {
                const response = await fetch(`${this.serverUrl}/get-user-data`);
                if (response.ok) {
                    this.userData = await response.json();
                    await this.saveState(); // 가져온 데이터 저장
                }
            } catch (error) {
                console.error('❌ 사용자 데이터 가져오기 실패:', error);
            }
        }

        // 이메일이 생성된 상태: 이메일 정보와 단계별 버튼 표시
        if (this.userData) {
            this.emailInfo.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 4px;">📧 생성된 이메일:</div>
                <div style="word-break: break-all; margin-bottom: 4px;">${this.userData.email}</div>
                <div style="opacity: 0.7;">👤 ${this.userData.firstName} ${this.userData.lastName}</div>
            `;
            this.emailInfo.style.display = 'block';
        }
        
        // 단계별 버튼 컨테이너 표시
        this.stepButtonsContainer.style.display = 'block';
        this.emailButton.style.display = 'none';

        // 현재 단계에 따라 버튼 상태 업데이트
        switch (this.currentStepNumber) {
            case 0:
                // 초기 상태 - 모든 버튼 비활성화
                this.updateButtonState(this.step1Button, true, '1️⃣ Sign In 클릭', 'rgba(59, 130, 246, 0.8)');
                this.updateButtonState(this.step2Button, false, '2️⃣ Sign Up 클릭', 'rgba(107, 114, 128, 0.5)');
                this.updateButtonState(this.step3Button, false, '3️⃣ 폼 작성', 'rgba(107, 114, 128, 0.5)');
                break;
            case 1:
                // Step 1 완료 - Step 2 활성화
                this.updateButtonState(this.step1Button, false, '✅ 완료', 'rgba(16, 185, 129, 0.8)');
                this.updateButtonState(this.step2Button, true, '2️⃣ Sign Up 클릭', 'rgba(59, 130, 246, 0.8)');
                this.updateButtonState(this.step3Button, false, '3️⃣ 폼 작성', 'rgba(107, 114, 128, 0.5)');
                this.updateStatus('🎯 Step 2 준비됨', 'success');
                break;
            case 2:
                // Step 2 완료 - Step 3 활성화
                this.updateButtonState(this.step1Button, false, '✅ 완료', 'rgba(16, 185, 129, 0.8)');
                this.updateButtonState(this.step2Button, false, '✅ 완료', 'rgba(16, 185, 129, 0.8)');
                this.updateButtonState(this.step3Button, true, '3️⃣ 폼 작성', 'rgba(59, 130, 246, 0.8)');
                this.updateStatus('🎯 Step 3 준비됨', 'success');
                break;
            case 3:
                // 모든 단계 완료
                this.updateButtonState(this.step1Button, false, '✅ 완료', 'rgba(16, 185, 129, 0.8)');
                this.updateButtonState(this.step2Button, false, '✅ 완료', 'rgba(16, 185, 129, 0.8)');
                this.updateButtonState(this.step3Button, false, '✅ 완료', 'rgba(16, 185, 129, 0.8)');
                this.updateStatus('🎉 모든 단계 완료!', 'success');
                break;
        }

        console.log(`🔄 UI 상태 업데이트: Step ${this.currentStepNumber}, 이메일: ${this.emailGenerated}`);
    }

    // 이메일 생성 함수
    async generateEmail() {
        if (!this.serverConnected) {
            this.updateStatus('🔴 서버 연결 필요', 'error');
            return;
        }

        this.emailButton.disabled = true;
        this.emailButton.textContent = '⏳ 이메일 생성 중...';
        this.updateStatus('📧 이메일 생성 중...', 'processing');

        try {
            const response = await fetch(`${this.serverUrl}/generate-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                
                // 상태 업데이트
                this.emailGenerated = true;
                this.userData = data;
                this.currentStepNumber = 0; // 이메일 생성 완료, Step 1 준비
                
                // 상태 저장
                await this.saveState();
                
                // 이메일 정보 표시
                this.emailInfo.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 4px;">📧 생성된 이메일:</div>
                    <div style="word-break: break-all; margin-bottom: 4px;">${data.email}</div>
                    <div style="opacity: 0.7;">👤 ${data.firstName} ${data.lastName}</div>
                `;
                this.emailInfo.style.display = 'block';
                
                // 단계별 버튼 표시
                this.stepButtonsContainer.style.display = 'block';
                this.emailButton.style.display = 'none';
                
                this.updateStatus('✅ 이메일 생성 완료!', 'success');
                console.log('✅ 이메일 생성 완료:', data.email);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            this.updateStatus('❌ 이메일 생성 실패', 'error');
            this.emailButton.disabled = false;
            this.emailButton.textContent = '📧 임시 이메일 생성';
            console.error('❌ 이메일 생성 실패:', error);
        }
    }

    // 버튼 상태 업데이트 함수
    updateButtonState(button, enabled, text, color) {
        button.disabled = !enabled;
        button.textContent = text;
        button.style.cursor = enabled ? 'pointer' : 'not-allowed';
        button.style.opacity = enabled ? '1' : '0.6';
        if (color) {
            button.style.background = color;
        }
    }

    // Step 1: Sign In 버튼 클릭
    async executeStep1() {
        this.updateButtonState(this.step1Button, false, '⏳ 실행 중...', 'rgba(59, 130, 246, 0.5)');
        this.updateStatus('🔍 Sign In 버튼 찾는 중...', 'processing');

        try {
            // cursor.com 메인 페이지에서 Sign In 버튼 찾기
            const signInSelectors = [
                'a[href*="auth"]',
                'a[href*="login"]', 
                'a[href*="signin"]',
                '.sign-in',
                '.login-btn'
            ];

            let signInButton = null;
            for (const selector of signInSelectors) {
                signInButton = document.querySelector(selector);
                if (signInButton) {
                    console.log(`✅ Sign In 버튼 발견: ${selector}`);
                    break;
                }
            }

            if (!signInButton) {
                // 텍스트로 찾기
                const links = Array.from(document.querySelectorAll('a, button'));
                signInButton = links.find(el => {
                    const text = el.textContent.toLowerCase().trim();
                    return text.includes('sign in') || text.includes('login') || text.includes('로그인');
                });
            }

            if (signInButton) {
                this.updateStatus('✅ Sign In 버튼 발견!', 'success');
                await this.sleep(500);
                
                // 클릭
                signInButton.click();
                console.log('🖱️ Sign In 버튼 클릭됨');
                
                this.updateStatus('🚀 Sign In 클릭 완료!', 'success');
                this.updateButtonState(this.step1Button, false, '✅ 완료', 'rgba(16, 185, 129, 0.8)');
                
                // 상태 업데이트 및 저장
                this.currentStepNumber = 1;
                await this.saveState();
                
                // Step 2 버튼 활성화
                setTimeout(() => {
                    this.updateButtonState(this.step2Button, true, '2️⃣ Sign Up 클릭', 'rgba(59, 130, 246, 0.8)');
                }, 2000);
                
            } else {
                throw new Error('Sign In 버튼을 찾을 수 없습니다');
            }
        } catch (error) {
            console.error('❌ Step 1 실행 실패:', error);
            this.updateStatus('❌ Sign In 버튼 찾기 실패', 'error');
            this.updateButtonState(this.step1Button, true, '1️⃣ Sign In 클릭', 'rgba(59, 130, 246, 0.8)');
        }
    }

    // Step 2: Sign Up 버튼 클릭
    async executeStep2() {
        this.updateButtonState(this.step2Button, false, '⏳ 실행 중...', 'rgba(59, 130, 246, 0.5)');
        this.updateStatus('🔍 Sign Up 버튼 찾는 중...', 'processing');

        try {
            // authenticator.cursor.sh 페이지에서 Sign Up 버튼 찾기
            const signUpSelectors = [
                'a[href*="sign-up"]',
                '.sign-up',
                '.signup-btn'
            ];

            let signUpButton = null;
            for (const selector of signUpSelectors) {
                signUpButton = document.querySelector(selector);
                if (signUpButton) {
                    console.log(`✅ Sign Up 버튼 발견: ${selector}`);
                    break;
                }
            }

            if (!signUpButton) {
                // 텍스트로 찾기
                const links = Array.from(document.querySelectorAll('a, button'));
                signUpButton = links.find(el => {
                    const text = el.textContent.toLowerCase().trim();
                    return text.includes('sign up') || text.includes('signup') || text.includes('회원가입');
                });
            }

            if (signUpButton) {
                this.updateStatus('✅ Sign Up 버튼 발견!', 'success');
                await this.sleep(500);
                
                // 클릭
                signUpButton.click();
                console.log('🖱️ Sign Up 버튼 클릭됨');
                
                this.updateStatus('🚀 Sign Up 클릭 완료!', 'success');
                this.updateButtonState(this.step2Button, false, '✅ 완료', 'rgba(16, 185, 129, 0.8)');
                
                // 상태 업데이트 및 저장
                this.currentStepNumber = 2;
                await this.saveState();
                
                // Step 3 버튼 활성화
                setTimeout(() => {
                    this.updateButtonState(this.step3Button, true, '3️⃣ 폼 작성', 'rgba(59, 130, 246, 0.8)');
                }, 2000);
                
            } else {
                throw new Error('Sign Up 버튼을 찾을 수 없습니다');
            }
        } catch (error) {
            console.error('❌ Step 2 실행 실패:', error);
            this.updateStatus('❌ Sign Up 버튼 찾기 실패', 'error');
            this.updateButtonState(this.step2Button, true, '2️⃣ Sign Up 클릭', 'rgba(59, 130, 246, 0.8)');
        }
    }

    // Step 3: 폼 작성 및 제출
    async executeStep3() {
        this.updateButtonState(this.step3Button, false, '⏳ 실행 중...', 'rgba(59, 130, 246, 0.5)');
        this.updateStatus('📝 폼 작성 중...', 'processing');

        try {
            // 서버에서 사용자 데이터 가져오기
            const response = await fetch(`${this.serverUrl}/get-user-data`);
            if (!response.ok) {
                throw new Error('사용자 데이터를 가져올 수 없습니다');
            }
            
            const userData = await response.json();
            console.log('📋 사용자 데이터 로드:', userData);

            // 폼 필드 찾기 및 작성
            const firstNameField = document.querySelector('input[name*="first"], input[name*="firstName"], input[placeholder*="First"], input[placeholder*="이름"]');
            const lastNameField = document.querySelector('input[name*="last"], input[name*="lastName"], input[placeholder*="Last"], input[placeholder*="성"]');
            const emailField = document.querySelector('input[type="email"], input[name*="email"], input[placeholder*="email"], input[placeholder*="이메일"]');

            if (firstNameField && lastNameField && emailField) {
                // 필드 작성
                firstNameField.value = userData.firstName;
                firstNameField.dispatchEvent(new Event('input', { bubbles: true }));
                await this.sleep(300);

                lastNameField.value = userData.lastName;
                lastNameField.dispatchEvent(new Event('input', { bubbles: true }));
                await this.sleep(300);

                emailField.value = userData.email;
                emailField.dispatchEvent(new Event('input', { bubbles: true }));
                await this.sleep(300);

                // 계속 버튼 찾기
                const continueSelectors = [
                    'button[type="submit"]',
                    '.continue-btn',
                    '.submit-btn'
                ];

                let continueButton = null;
                for (const selector of continueSelectors) {
                    continueButton = document.querySelector(selector);
                    if (continueButton) break;
                }

                if (!continueButton) {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    continueButton = buttons.find(btn => {
                        const text = btn.textContent.toLowerCase().trim();
                        return text.includes('continue') || text.includes('계속') || text.includes('다음') || text.includes('submit');
                    });
                }

                if (continueButton) {
                    await this.sleep(500);
                    continueButton.click();
                    console.log('🖱️ Continue 버튼 클릭됨');
                    
                    this.updateStatus('✅ 폼 작성 완료!', 'success');
                    this.updateButtonState(this.step3Button, false, '✅ 완료', 'rgba(16, 185, 129, 0.8)');
                    
                    // 상태 업데이트 및 저장
                    this.currentStepNumber = 3;
                    await this.saveState();
                } else {
                    throw new Error('Continue 버튼을 찾을 수 없습니다');
                }
            } else {
                throw new Error('필수 폼 필드를 찾을 수 없습니다');
            }
        } catch (error) {
            console.error('❌ Step 3 실행 실패:', error);
            this.updateStatus('❌ 폼 작성 실패', 'error');
            this.updateButtonState(this.step3Button, true, '3️⃣ 폼 작성', 'rgba(59, 130, 246, 0.8)');
        }
    }

    // 상태 업데이트
    updateStatus(message, type = 'info') {
        if (!this.statusWidget || !this.statusText) return;
        
        // 상태별 색상
        let gradient = '';
        switch (type) {
            case 'success':
                gradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                break;
            case 'error':
                gradient = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
                break;
            case 'processing':
                gradient = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
                break;
            case 'stopped':
                gradient = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
                break;
            case 'info':
            default:
                gradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                break;
        }
        
        this.statusWidget.style.background = gradient;
        this.statusText.textContent = message;
    }

    // 자동화 시작/중단 토글
    // 자동화 토글 함수는 제거됨 - 단계별 버튼으로 대체

    // 기존 자동화 시작 함수 - 단계별 버튼으로 대체됨
    /*
    startAutomation() {
        console.log('🚀 자동화를 시작합니다');
        
        // 세션 조건 확인
        if (!this.shouldRunAutomation() && this.isMainTab) {
            // 메인 탭에서는 조건 무시하고 시작 (사용자가 직접 시작)
            console.log('✅ 메인 탭에서 사용자 직접 시작');
        } else if (!this.shouldRunAutomation() && !this.isMainTab) {
            console.log('❌ 자동화 시작 조건 불충족');
            return;
        }
        
        this.isStarted = true;
        this.isStopped = false;
        this.isProcessing = false;
        
        this.updateStatus('🚀 자동화 시작됨', 'processing');
        this.showNotification('자동화가 시작되었습니다', 'success');
        this.updateControlButton();
        
        // 중앙제어 모드 시작
        if (this.centralControlEnabled) {
            console.log('🎯 중앙제어 모드로 시작');
            this.startCentralControlLoop();
        } else {
            // 기존 방식으로 시작
            setTimeout(() => {
                this.startAutoFill();
            }, 1000);
        }
    }
    */
    
    // 중앙제어 실행 루프 시작
    async startCentralControlLoop() {
        console.log('🔄 중앙제어 루프 시작');
        
        // 초기 페이지 상태 보고
        await this.reportPageState();
        
        // 2초마다 서버에서 명령을 받아 실행
        this.stepExecutionInterval = setInterval(async () => {
            if (this.isStopped || !this.isStarted) {
                console.log('⏹️ 중앙제어 루프 중단됨');
                this.stopCentralControlLoop();
                return;
            }
            
            try {
                // 페이지 상태 보고
                await this.reportPageState();
                
                // 다음 명령 요청
                const command = await this.getNextCommand();
                
                if (command && command.type !== 'wait_for_next') {
                    console.log('📋 서버 명령 실행:', command);
                    await this.executeCommand(command);
                    
                    // 명령 실행 후 상태 다시 보고
                    await this.reportPageState();
                } else if (!command) {
                    console.log('⏳ 서버에서 명령 대기 중...');
                } else {
                    console.log('⏳ 서버에서 다음 명령 대기 중...');
                }
                
            } catch (error) {
                console.log('❌ 중앙제어 루프 오류:', error);
                this.updateStatus('❌ 중앙제어 오류', 'error');
            }
        }, 2000); // 2초마다 실행
    }
    
    // 중앙제어 실행 루프 중단
    stopCentralControlLoop() {
        if (this.stepExecutionInterval) {
            clearInterval(this.stepExecutionInterval);
            this.stepExecutionInterval = null;
            console.log('⏹️ 중앙제어 루프 중단됨');
        }
    }

    // 자동화 중단
    stopAutomation() {
        console.log('🛑 자동화를 중단합니다');
        
        // 모든 진행 중인 작업 중단
        this.isProcessing = false;
        this.isStopped = true;
        this.isStarted = false;
        
        // 모든 타이머 정리
        this.clearAllTimers();
        
        // 중앙제어 루프 중단
        this.stopCentralControlLoop();
        
        // 상태 업데이트
        this.updateStatus('🛑 자동화 중단됨', 'stopped');
        this.showNotification('자동화가 중단되었습니다', 'info');
        this.updateControlButton();
    }

    // 오류 발생 시 자동 중단
    forceStop(reason = '오류 발생') {
        console.log(`⚠️ 자동 중단: ${reason}`);
        
        this.isProcessing = false;
        this.isStopped = true;
        this.isStarted = false;
        
        this.clearAllTimers();
        
        this.updateStatus(`❌ ${reason} - 중단됨`, 'error');
        this.showNotification(`${reason}으로 인해 자동화가 중단되었습니다`, 'error');
        this.updateControlButton();
    }

    // 모든 타이머 정리
    clearAllTimers() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        if (this.currentInterval) {
            clearInterval(this.currentInterval);
            this.currentInterval = null;
        }
    }

    // 제어 버튼 상태 업데이트
    updateControlButton() {
        if (!this.controlButton) return;
        
        if (!this.serverConnected) {
            this.controlButton.textContent = '🔴 서버 연결 필요';
            this.controlButton.disabled = true;
            this.controlButton.style.opacity = '0.5';
        } else if (this.isStarted && !this.isStopped) {
            this.controlButton.textContent = '⏹️ 자동화 중단';
            this.controlButton.disabled = false;
            this.controlButton.style.opacity = '1';
        } else {
            this.controlButton.textContent = '🚀 자동 회원가입 시작';
            this.controlButton.disabled = false;
            this.controlButton.style.opacity = '1';
        }
    }

    // 안전한 요소 클릭
    clickElementSafely(element, elementName) {
        try {
            if (element && typeof element.click === 'function') {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    element.click();
                    console.log(`✅ ${elementName} 클릭 완료`);
                }, 300);
            } else {
                throw new Error(`${elementName}이 클릭 가능한 요소가 아닙니다`);
            }
        } catch (error) {
            console.error(`❌ ${elementName} 클릭 실패:`, error);
            this.showNotification(`${elementName} 클릭에 실패했습니다`, 'error');
        }
    }

    // 강화된 요소 찾기 (여러 셀렉터 시도)
    findElementBySelectors(selectors, elementName) {
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    console.log(`✅ ${elementName}을 찾았습니다! (셀렉터: ${selector})`);
                    return element;
                }
            } catch (e) {
                continue;
            }
        }
        
        console.log(`❌ ${elementName}을 찾을 수 없습니다`);
        return null;
    }

    // 요소가 나타날 때까지 대기 (향상된 버전)
    async waitForElement(selectors, elementName, maxWaitSeconds = 30) {
        console.log(`⏳ ${elementName}이 나타날 때까지 대기합니다... (최대 ${maxWaitSeconds}초)`);
        
        for (let i = 0; i < maxWaitSeconds * 2; i++) { // 0.5초마다 확인
            const element = this.findElementBySelectors(selectors, elementName);
            if (element) {
                console.log(`✅ ${elementName}을 찾았습니다!`);
                return element;
            }
            await this.sleep(500);
        }
        
        throw new Error(`${elementName}이 ${maxWaitSeconds}초 내에 나타나지 않았습니다`);
    }

    // CAPTCHA 감지 강화
    detectCaptcha() {
        const captchaSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]', 
            'div[class*="captcha"]',
            'div[class*="challenge"]',
            'div[class*="verification"]',
            '[data-testid*="captcha"]',
            '.cf-challenge-form',
            '#challenge-form',
            '.challenge-running'
        ];

        for (const selector of captchaSelectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null) { // 보이는 요소만
                    console.log(`🚨 CAPTCHA 감지됨: ${selector}`);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }

        return false;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Background Script에 메시지 전송
    notifyBackgroundScript(action, data = {}) {
        try {
            chrome.runtime.sendMessage({
                action: action,
                data: data,
                timestamp: Date.now(),
                url: window.location.href
            });
        } catch (error) {
            console.log('Background Script 통신 실패:', error);
        }
    }
}

// 확장프로그램 시작
const cursorAutoFill = new CursorAutoFill();