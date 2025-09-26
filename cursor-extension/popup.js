// Popup UI Logic for Cursor Extension
console.log('🎭 Cursor Extension Popup 시작');

class PopupManager {
    constructor() {
        this.serverUrl = 'http://localhost:8080';
        this.isConnected = false;
        this.emailGenerated = false;
        this.currentStep = 0;
        this.init();
    }

    async init() {
        // DOM 요소들 가져오기
        this.serverStatus = document.getElementById('serverStatus');
        this.serverStatusText = document.getElementById('serverStatusText');
        this.statusDetails = document.getElementById('statusDetails');
        this.generateEmailButton = document.getElementById('generateEmailButton');
        this.emailStatus = document.getElementById('emailStatus');
        this.generatedEmail = document.getElementById('generatedEmail');
        this.stepButtons = document.getElementById('stepButtons');
        this.step1Button = document.getElementById('step1Button');
        this.step2Button = document.getElementById('step2Button');
        this.step3Button = document.getElementById('step3Button');
        this.openCursorButton = document.getElementById('openCursorButton');
        this.refreshButton = document.getElementById('refreshButton');
        this.logArea = document.getElementById('logArea');

        // 이벤트 리스너 등록
        this.setupEventListeners();

        // 초기 서버 상태 확인
        await this.checkServerStatus();
    }

    setupEventListeners() {
        // 이메일 생성 버튼
        this.generateEmailButton.addEventListener('click', () => {
            this.generateEmail();
        });

        // 단계별 버튼들
        this.step1Button.addEventListener('click', () => {
            this.executeStep1();
        });

        this.step2Button.addEventListener('click', () => {
            this.executeStep2();
        });

        this.step3Button.addEventListener('click', () => {
            this.executeStep3();
        });

        // Cursor.com 열기 버튼
        this.openCursorButton.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://cursor.com' });
        });

        // 새로고침 버튼
        this.refreshButton.addEventListener('click', () => {
            this.checkServerStatus();
        });
    }

    async checkServerStatus() {
        this.log('서버 연결 상태를 확인합니다...');
        
        try {
            const response = await fetch(`${this.serverUrl}/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(3000) // 3초 타임아웃
            });

            if (response.ok) {
                const data = await response.json();
                this.setConnectedStatus(true, data.message || 'Go 서버 연결됨');
                this.log('✅ Go 서버 연결 성공');
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            this.setConnectedStatus(false, 'Go 서버 연결 실패');
            this.log(`❌ 서버 연결 실패: ${error.message}`);
        }
    }

    setConnectedStatus(connected, message) {
        this.isConnected = connected;
        
        if (connected) {
            this.serverStatus.className = 'status-dot connected';
            this.serverStatusText.textContent = '서버 연결됨';
            this.statusDetails.textContent = message;
            this.generateEmailButton.disabled = false;
            this.generateEmailButton.innerHTML = '📧 임시 이메일 생성';
        } else {
            this.serverStatus.className = 'status-dot disconnected';
            this.serverStatusText.textContent = '서버 연결 실패';
            this.statusDetails.textContent = message + ' - Go 프로그램을 실행하세요';
            this.generateEmailButton.disabled = true;
            this.generateEmailButton.innerHTML = '<span class="loading"></span> 서버 연결 필요';
        }
    }

    async generateEmail() {
        if (!this.isConnected) {
            this.log('❌ 서버가 연결되지 않았습니다');
            return;
        }

        this.log('📧 임시 이메일을 생성합니다...');
        this.generateEmailButton.disabled = true;
        this.generateEmailButton.innerHTML = '<span class="loading"></span> 이메일 생성 중...';
        
        try {
            // Go 서버에 이메일 생성 요청
            const response = await fetch(`${this.serverUrl}/generate-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                this.emailGenerated = true;
                this.generatedEmail.textContent = data.email;
                this.emailStatus.style.display = 'block';
                this.stepButtons.style.display = 'block';
                this.generateEmailButton.style.display = 'none';
                
                this.log(`✅ 이메일 생성 완료: ${data.email}`);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            this.log(`❌ 이메일 생성 실패: ${error.message}`);
            this.generateEmailButton.disabled = false;
            this.generateEmailButton.innerHTML = '📧 임시 이메일 생성';
        }
    }

    async executeStep1() {
        this.log('1️⃣ Step 1: Sign In 버튼 클릭 실행...');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('cursor.com')) {
                this.log('⚠️ cursor.com 페이지가 아닙니다. 페이지를 먼저 열어주세요.');
                return;
            }

            chrome.tabs.sendMessage(tab.id, {
                type: 'EXECUTE_STEP',
                step: 1,
                action: 'CLICK_SIGN_IN'
            });
            
            this.step1Button.disabled = true;
            this.step1Button.innerHTML = '✅ 완료';
            this.step2Button.disabled = false;
            this.currentStep = 1;
            
            this.log('✅ Step 1 완료 - Sign In 버튼 클릭됨');
        } catch (error) {
            this.log(`❌ Step 1 실패: ${error.message}`);
        }
    }

    async executeStep2() {
        this.log('2️⃣ Step 2: Sign Up 버튼 클릭 실행...');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('authenticator.cursor.sh')) {
                this.log('⚠️ authenticator 페이지가 아닙니다. Step 1을 먼저 완료해주세요.');
                return;
            }

            chrome.tabs.sendMessage(tab.id, {
                type: 'EXECUTE_STEP',
                step: 2,
                action: 'CLICK_SIGN_UP'
            });
            
            this.step2Button.disabled = true;
            this.step2Button.innerHTML = '✅ 완료';
            this.step3Button.disabled = false;
            this.currentStep = 2;
            
            this.log('✅ Step 2 완료 - Sign Up 버튼 클릭됨');
        } catch (error) {
            this.log(`❌ Step 2 실패: ${error.message}`);
        }
    }

    async executeStep3() {
        this.log('3️⃣ Step 3: 회원가입 폼 작성 실행...');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('sign-up')) {
                this.log('⚠️ sign-up 페이지가 아닙니다. Step 2를 먼저 완료해주세요.');
                return;
            }

            chrome.tabs.sendMessage(tab.id, {
                type: 'EXECUTE_STEP',
                step: 3,
                action: 'FILL_SIGNUP_FORM'
            });
            
            this.step3Button.disabled = true;
            this.step3Button.innerHTML = '✅ 완료';
            this.currentStep = 3;
            
            this.log('✅ Step 3 완료 - 회원가입 폼 작성됨');
        } catch (error) {
            this.log(`❌ Step 3 실패: ${error.message}`);
        }
    }

    log(message) {
        console.log(message);
        
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        
        // 로그 영역에 추가
        if (this.logArea.style.display === 'none') {
            this.logArea.style.display = 'block';
        }
        
        this.logArea.textContent += logEntry + '\n';
        this.logArea.scrollTop = this.logArea.scrollHeight;
    }
}

// 팝업 로드 시 시작
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});