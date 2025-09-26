// Background Service Worker for Cursor Extension
console.log('🚀 Cursor Extension Background Script 시작');

let currentTabId = null;
let newAuthTabId = null;
let isWaitingForNewTab = false;
let hasStartedAutomation = false; // 자동화 시작 여부 추적

// 확장프로그램 설치/업데이트 시 실행
chrome.runtime.onInstalled.addListener((details) => {
    console.log('📦 확장프로그램 설치/업데이트:', details.reason);
    
    if (details.reason === 'install') {
        console.log('🎉 Cursor 자동 회원가입 확장프로그램이 설치되었습니다!');
        
        // 설치 후 cursor.com으로 리다이렉트 (선택사항)
        // chrome.tabs.create({ url: 'https://cursor.com' });
    }
});

// 새 탭 생성 감지
chrome.tabs.onCreated.addListener((tab) => {
    console.log('🆕 새 탭 생성됨:', tab.id, tab.url);
    
    // Sign in 클릭 후 새 탭이 생성된 경우
    if (isWaitingForNewTab) {
        newAuthTabId = tab.id;
        console.log('🔗 인증 새 탭 감지:', tab.id);
    }
});

// 탭 업데이트 감지 (페이지 이동 추적)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 페이지 로딩이 완료된 경우
    if (changeInfo.status === 'complete' && tab.url) {
        
        // cursor.com 또는 authenticator.cursor.sh 도메인 확인
        if (tab.url.includes('cursor.com') || tab.url.includes('authenticator.cursor.sh')) {
            console.log('🌐 Cursor 관련 페이지 감지:', tab.url);
            
            // 새 탭에서 로그인/인증 페이지가 열린 경우
            if (newAuthTabId === tabId && (
                tab.url.includes('cursor.com/dashboard') || 
                tab.url.includes('/login') || 
                tab.url.includes('/auth') ||
                tab.url.includes('/sign-up') ||
                tab.url.includes('authenticator.cursor.sh'))) {
                
                console.log('🎯 새 탭에서 인증 페이지 로드 완료:', tab.url);
                
                // 원본 탭에 새 탭 정보 알림
                if (currentTabId) {
                    chrome.tabs.sendMessage(currentTabId, {
                        type: 'NEW_AUTH_TAB_READY',
                        url: tab.url,
                        tabId: tabId
                    }).catch(error => {
                        console.log('원본 탭 메시지 전송 실패:', error);
                    });
                }
                
                // authenticator.cursor.sh에서만 자동 시작 신호 전송
                if (tab.url.includes('authenticator.cursor.sh')) {
                    if (!hasStartedAutomation) {
                        hasStartedAutomation = true;
                        console.log('🚀 authenticator 페이지에서 자동 시작 신호 전송');
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tabId, {
                                type: 'AUTO_START_REQUESTED',
                                fromOriginalTab: true,
                                url: tab.url,
                                sessionId: Date.now() // 세션 ID 추가
                            }).catch(error => {
                                console.log('새 탭 자동 시작 신호 전송 실패:', error);
                            });
                        }, 1000);
                    } else {
                        console.log('⏭️ 자동화가 이미 시작되어 중복 신호 전송 건너뛰기');
                    }
                } else if (tab.url.includes('cursor.com/dashboard')) {
                    console.log('📄 dashboard 페이지 감지 - 리다이렉트 대기 중...');
                }
                
                isWaitingForNewTab = false;
            }
            
            // Content Script에 메시지 전송
            chrome.tabs.sendMessage(tabId, {
                type: 'PAGE_LOADED',
                url: tab.url
            }).catch(error => {
                // Content script가 아직 준비되지 않은 경우 무시
                console.log('Content script not ready yet');
            });
        }
    }
});

// Content Script에서 오는 메시지 처리
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Background에서 메시지 수신:', message);
    
    // 새로운 메시지 형식 처리
    if (message.action) {
        switch (message.action) {
            case 'SIGNIN_CLICKED':
                console.log('🖱️ Sign in 버튼 클릭됨, 새 탭 대기 시작');
                currentTabId = sender.tab.id;
                isWaitingForNewTab = true;
                newAuthTabId = null;
                hasStartedAutomation = false; // 새로운 세션 시작
                
                // 5초 후 대기 상태 해제
                setTimeout(() => {
                    if (isWaitingForNewTab) {
                        isWaitingForNewTab = false;
                        console.log('⏰ 새 탭 대기 시간 초과');
                    }
                }, 5000);
                break;
                
            default:
                console.log('알 수 없는 action:', message.action);
        }
        return;
    }
    
    // 기존 메시지 형식 처리
    switch (message.type) {
        case 'LOG':
            console.log(`[Content] ${message.data}`);
            break;
            
        case 'NOTIFICATION':
            // 시스템 알림 표시 (선택사항)
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icon48.png',
                title: 'Cursor 자동 회원가입',
                message: message.data
            });
            break;
            
        case 'GET_USER_DATA':
            // Go 서버에서 사용자 데이터 요청
            handleGetUserData(sendResponse);
            return true; // 비동기 응답을 위해 true 반환
            
        default:
            console.log('알 수 없는 메시지 타입:', message.type);
    }
});

// Go 서버에서 사용자 데이터 가져오기
async function handleGetUserData(sendResponse) {
    try {
        const response = await fetch('http://localhost:8080/get-user-data', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const userData = await response.json();
        console.log('✅ Go 서버에서 사용자 데이터 수신:', userData);
        
        sendResponse({ success: true, data: userData });
    } catch (error) {
        console.error('❌ Go 서버 연결 실패:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// 확장프로그램 아이콘 클릭 시 처리
chrome.action.onClicked.addListener((tab) => {
    console.log('🖱️ 확장프로그램 아이콘 클릭됨');
    
    // cursor.com이 아닌 경우 cursor.com으로 이동
    if (!tab.url || !tab.url.includes('cursor.com')) {
        chrome.tabs.update(tab.id, { url: 'https://cursor.com' });
    } else {
        // 이미 cursor.com인 경우 새로고침
        chrome.tabs.reload(tab.id);
    }
});

console.log('✅ Background Script 초기화 완료');