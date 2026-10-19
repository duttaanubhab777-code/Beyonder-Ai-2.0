/* "Install App" button: only appears once the browser says the app is installable. */
let deferredPrompt = null;

export function initInstallButton(button) {
    if (!button) return;

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredPrompt = event;
        button.hidden = false;
    });

    button.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        button.hidden = true;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
    });

    window.addEventListener("appinstalled", () => {
        button.hidden = true;
        deferredPrompt = null;
    });
}
