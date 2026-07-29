# EngFore

EngFore is a modern English learning platform designed for Vietnamese learners. The goal is to provide an engaging and organized environment to practice vocabulary, grammar, listening, reading, and develop daily learning habits.

***

## 1. Project Overview

This platform aims to solve the common challenges faced by Vietnamese students and self-learners when studying English. By offering a structured and interactive learning path, EngFore helps users build a solid foundation and maintain consistent practice. The project is currently in the UI Foundation stage, focusing on creating a clean, intuitive, and user-friendly interface.

## 2. Features

### Current Features

- ✅ Modern UI Architecture
- ✅ Reusable CSS Design System
- ✅ Responsive Application Layout
- ✅ Sidebar Navigation
- ✅ Project Documentation

### In Progress

- 🚧 Dashboard UI
- 🚧 Topbar
- 🚧 Dashboard Components

### Planned Features

- 📚 Vocabulary Learning
- 📝 Grammar Practice
- 🎧 Listening Practice
- 📖 Reading Practice
- 🔥 Daily Streak
- 📊 Learning Statistics
- 👤 User Authentication

## 3. Tech Stack

The project is built using fundamental web technologies to ensure accessibility and maintainability.

- **HTML5:** For the structure and content of the web pages.
- **CSS3:** For styling and responsive design.
- **JavaScript (Vanilla):** For client-side interactivity and dynamic content.
- **Git & GitHub:** For version control and collaborative development.

## 4. Project Structure

The repository is organized to separate concerns, making it easier to navigate and manage.
```text
EngFore/
├── assets/
│   ├── fonts/
│   ├── icons/
│   └── images/
├── css/
│   ├── base.css
│   ├── components.css
│   ├── dashboard.css
│   ├── layout.css
│   ├── responsive.css
│   ├── sidebar.css
│   ├── topbar.css
│   └── variables.css
├── data/
├── docs/
├── js/
├── pages/
└── index.html
```


## 5. Folder Description

| Folder | Description |
| :--- | :--- |
| **`assets/`** | Contains all static assets like images, icons, and fonts. |
| **`css/`** | Holds all the CSS stylesheets for the project. |
| **`data/`** | Stores data files, such as JSON files for vocabulary, quizzes, and reading content. |
| **`docs/`** | Includes project documentation, like design documents and cleanup notes. |
| **`js/`** | Contains all JavaScript files for application logic and interactivity. |
| **`pages/`** | Holds additional HTML pages for different sections like Grammar and Vocabulary. |
| **`index.html`** | The main entry point of the web application. |

## 6. Getting Started

To get a local copy up and running, follow these simple steps.

1.  **Clone the repository:**
    ```sh
    git clone <git clone https://github.com/toantottinh/engfore-app.git>
    ```
2.  **Navigate to the project directory:**
    ```sh
    cd EngFore
    ```
3.  **Open `index.html` in your browser:**
    Simply open the `index.html` file in your preferred web browser to view the application. No special servers or build steps are required at this stage.

## 7. Roadmap

### Sprint 1
- [x] Project Structure
- [x] CSS Architecture
- [x] Sidebar
- [x] Layout

### Sprint 2
- [ ] Dashboard
- [ ] Topbar
- [ ] Card Components

### Sprint 3
- [ ] Vocabulary

### Sprint 4
- [ ] Grammar

### Sprint 5
- [ ] Reading

### Sprint 6
- [ ] Listening

### Sprint 7
- [ ] Review System

## 8. Git Workflow

This project uses a simple feature branch workflow to keep development organized and the main branch stable. [1]

1.  **Main Branch:** The `main` branch is the primary branch and should always be in a deployable state. Direct pushes to `main` are discouraged.
2.  **Feature Branches:** All new features and bug fixes should be developed in separate branches. [1]
    - Create a new branch from `main`: `git checkout -b feature/your-feature-name`
    - Work on your feature and commit your changes.
    - Push your feature branch to the remote repository: `git push origin feature/your-feature-name`
3.  **Pull Requests (PRs):** Once a feature is complete, open a Pull Request to merge the feature branch into `main`.
    - The PR should be reviewed by at least one other team member.
    - After approval, the PR can be merged into `main`.

This workflow helps isolate work in progress and allows for code reviews before changes are integrated into the main codebase. [1]

## 9. Screenshots

Coming soon.

Dashboard Preview

Vocabulary Page

Grammar Page

Reading Page

## 10. Future Improvements

- **User Authentication:** Allow users to create accounts to save their progress.
- **Progress Tracking:** Visualize user progress with charts and statistics.
- **Gamification:** Add points, badges, and leaderboards to make learning more engaging.
- **Mobile Responsiveness:** Enhance the UI for a seamless experience on mobile devices.
Dark / Light Theme

Offline Learning

PWA Support

Search Vocabulary

Spaced Repetition

AI Chat Tutor

## 11.  Author

Nguyễn Hiếu Toàn

GitHub:
https://github.com/toantottinh

Project:
https://github.com/toantottinh/engfore-app