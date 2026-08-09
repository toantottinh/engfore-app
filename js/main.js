import { renderDashboard } from './pages/dashboard.js';
import { renderVocabularyLibrary } from '../vocabulary-library.js';
import { renderVocabularyDetail } from '../vocabulary-detail.js';
import { renderPracticeSession } from '../practice-session.js';
import { renderLoginPage } from '../page-login.js';
import { renderRegisterPage } from '../page-register.js';

const routes = {
    '/': renderDashboard,
    '/library': renderVocabularyLibrary,
    '/set/:id': renderVocabularyDetail,
    '/practice/:setId': renderPracticeSession,
    '/login': renderLoginPage,
    '/register': renderRegisterPage,
};

function router() {
    const path = window.location.hash.slice(1);
    const mainContent = document.getElementById('main-content');

    // Simple regex for parameter matching (e.g., /set/:id)
    const route = Object.keys(routes).find(r => {
        const regex = new RegExp(`^${r.replace(/:\w+/g, '(\w+)')}$`);
        return regex.test(path);
    });

    if (route) {
        const renderer = routes[route];
        const params = route.match(/:(\w+)/g)?.map(p => p.substring(1));
        const values = path.match(new RegExp(`^${route.replace(/:\w+/g, '(\w+)')}$`))?.slice(1);
        
        const args = {};
        if (params && values) {
            params.forEach((param, index) => {
                args[param] = values[index];
            });
        }
        
        renderer(mainContent, args);
    } else {
        mainContent.innerHTML = '<h1>404 Not Found</h1>';
    }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

// Initial route
router();
