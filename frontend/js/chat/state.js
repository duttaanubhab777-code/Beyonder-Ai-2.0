/* Shared, in-memory state for the chat page. */
export const state = {
    sessionId: "",
    history: [],
    busy: false,
    profile: { name: "", address: "", email: "", avatar: null, isAdmin: false },
    pushAvailable: false,
};
