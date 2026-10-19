import { isImpersonating, storage } from "../core/storage.js";
import { state } from "./state.js";

export const newSessionId = () => `chat_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;

const read = () => (isImpersonating() ? storage.getTab(storage.KEY.session) : storage.get(storage.KEY.session));
const write = (id) => (isImpersonating() ? storage.setTab(storage.KEY.session, id) : storage.set(storage.KEY.session, id));

export function initSession() {
    let id = read();
    if (!id || id === "default_session") {
        id = newSessionId();
        write(id);
    }
    state.sessionId = id;
}

export function setSession(id) {
    state.sessionId = id;
    write(id);
}
