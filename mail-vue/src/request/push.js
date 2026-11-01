import http from "@/axios/index.js";

// noMsg：推送失败不能弹红叉，桌面通知仍可用
export function pushKey() {
	return http.get('/push/key', {noMsg: true});
}

export function subscribePush(subscription) {
	return http.post('/push/subscribe', subscription, {noMsg: true});
}

export function testPush() {
	return http.post('/push/test', {}, {noMsg: true});
}

export function unsubscribePush(endpoint) {
	return http.post('/push/unsubscribe', {endpoint}, {noMsg: true});
}
