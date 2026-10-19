/* One fetch wrapper for every backend call: adds the token, parses JSON, throws ApiError. */
import { CONFIG } from "./config.js";
import { clearToken, getToken } from "./storage.js";

export class ApiError extends Error {
    constructor(message, status = 0, data = {}) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
    }
}

const onLoginPage = () => window.location.pathname.endsWith(CONFIG.PAGES.login);

function handleUnauthorized() {
    clearToken();
    if (!onLoginPage()) window.location.replace(CONFIG.PAGES.login);
}

export async function request(
    path,
    { method = "GET", body, auth = true, signal, raw = false, base } = {}
) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = getToken();
    if (auth && token) headers.Authorization = token;

    let res;
    try {
        res = await fetch((base ?? CONFIG.API_BASE) + path, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal
        });
    } catch (err) {
        if (err.name === "AbortError") throw err;
        throw new ApiError(
            "Can't reach the server. Check your internet connection.",
            0
        );
    }

    if (raw) {
        if (!res.ok) {
            if (res.status === 401 && auth) handleUnauthorized();
            throw new ApiError("Request failed.", res.status);
        }
        return res;
    }

    let data = {};
    try {
        data = await res.json();
    } catch {
        /* non-JSON reply */
    }

    if (!res.ok || data.success === false) {
        if (res.status === 401 && auth && data.code === "auth")
            handleUnauthorized();
        if (data.code === "maintenance") {
            window.dispatchEvent(
                new CustomEvent("beyonder:maintenance", {
                    detail: data.message
                })
            );
        }
        throw new ApiError(
            data.message || "Something went wrong. Please try again.",
            res.status,
            data
        );
    }
    return data;
}

export const api = {
    get: (path, opts) => request(path, { ...opts, method: "GET" }),
    post: (path, body = {}, opts) =>
        request(path, { ...opts, method: "POST", body }),
    del: (path, opts) => request(path, { ...opts, method: "DELETE" })
};
