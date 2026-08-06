const routes = [];
let appRoot = null;

/**
 * Tìm route phù hợp với path và trích xuất params.
 * @param {string} path - Path hiện tại từ URL hash.
 * @returns {{ route: object, params: object } | null}
 */
function matchRoute(path) {
    for (const route of routes) {
        const routeParts = route.path.split('/');
        const pathParts = path.split('/');

        if (routeParts.length !== pathParts.length) continue;

        const params = {};
        let match = true;
        for (let i = 0; i < routeParts.length; i++) {
            if (routeParts[i].startsWith(':')) {
                const paramName = routeParts[i].substring(1);
                params[paramName] = pathParts[i];
            } else if (routeParts[i] !== pathParts[i]) {
                match = false;
                break;
            }
        }

        if (match) {
            return { route, params };
        }
    }
    return null;
}

export async function navigate() {
    if (!appRoot) return;

    const path = window.location.hash.slice(1) || '/';
    const match = matchRoute(path);

    if (match) {
        await match.route.component(appRoot, match.params);
    } else {
        appRoot.innerHTML = `<h1>404 - Page Not Found</h1>`;
    }
}

export function addRoute(path, component) {
    routes.push({ path, component });
}

export function setRoot(element) {
    appRoot = element;
}