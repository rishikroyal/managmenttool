# managmenttool
# Project Management & Analytics Platform


## 📌 Project Overview
This project is a comprehensive, role-based **Project and Task Management Dashboard** built to streamline team collaboration, task assignment, and progress tracking. It features an ultra-modern, professional user interface, AI-powered task assignment suggestions, and real-time interactive analytics.

The platform is designed to be highly secure, scalable, and adheres strictly to RESTful architecture and relational database principles.

---

## 🎯 Functional Requirements Met

### 1. User Authentication
- **Secure Signup/Login Flow**: Users can register with their Name, Email, and Password.
- **JWT Authentication**: The system uses industry-standard JSON Web Tokens (JWT) for stateless, secure session management.
- **Password Security**: Passwords are never stored in plain text; they are securely salted and hashed using `bcrypt`.

### 2. Project Management
- **Creation & Administration**: Any user can create a project and automatically becomes the Admin of that specific project.
- **Access Control**: Project Admins have the exclusive ability to add or remove members from their projects.
- **Isolated Views**: Members only see and interact with projects they have been explicitly assigned to.

### 3. Task Management
- **Comprehensive Task Creation**: Tasks support Titles, Descriptions, Due Dates, and Priority levels (Low, Medium, High).
- **Intelligent Assignment**: Managers can assign tasks to specific employees. An integrated **Groq AI-powered Suggestion Engine** analyzes the task description and recommends the best-suited employee based on their current workload and role.
- **Dynamic Kanban Board**: Users update task statuses (To Do, In Progress, Done, On Hold) via an interactive drag-and-drop Kanban board. Tasks marked "Done" or "On Hold" require user feedback and support optional file uploads.

### 4. Dashboard & Analytics
- **Summary Statistics**: At-a-glance metrics showing Total Tasks, Tasks by Status, Tasks per User, and Overdue Tasks.
- **Visual Analytics**: Interactive, auto-updating Doughnut and Bar charts (powered by Chart.js) visualize task distribution by Status and Priority.

### 5. Role-Based Access Control (RBAC)
- **Admin**: Full system access. Can view all employees, globally assign tasks, and view company-wide analytics.
- **Manager**: Team-focused view. Can toggle between "My Tasks" and "Team Tasks", assign tasks to subordinates, and view team-level analytics.
- **Employee**: Individualized view. Can strictly view, update, and submit feedback on tasks specifically assigned to them.

---

## 🛠 Technology Stack

### Frontend (Client-Side)
- **Architecture**: Vanilla HTML5, CSS3, and JavaScript (ES6+). No heavy frameworks, ensuring lightning-fast load times.
- **Design System**: A custom-built, enterprise-grade dark mode UI inspired by modern tools like Linear and Vercel. Features glassmorphism, high-contrast typography, and fluid micro-animations.
- **Data Visualization**: `Chart.js` via CDN for robust dashboard graphing.

### Backend (Server-Side)
- **Framework**: **FastAPI** (Python) - Chosen for its incredible speed, asynchronous capabilities, and automatic OpenAPI documentation generation.
- **Data Validation**: **Pydantic** - Enforces strict schema validation for all incoming and outgoing API requests.
- **AI Integration**: **Groq API** (Llama 3) - Used for ultra-fast natural language processing to suggest task assignees.

### Database (Data Persistence)
- **Engine**: **PostgreSQL** - A highly reliable relational SQL database.
- **ORM**: **SQLAlchemy** - Manages database interactions securely, preventing SQL injection and simplifying complex relational queries.

---

## ⚙️ Backend & Database Architecture

This system was built with strict adherence to backend best practices:

### 1. RESTful APIs
The API follows standard REST conventions for resource management.
- `POST /auth/signup` - Create a user
- `GET /projects/` - Retrieve scoped projects
- `POST /tasks/` - Create a task
- `PATCH /tasks/{id}` - Update a task status
- `DELETE /projects/{id}/members/{user_id}` - Remove a resource

### 2. Proper SQL Relationships
The PostgreSQL schema maintains deep referential integrity using **Foreign Keys**:
- **Users to Projects**: A many-to-many relationship managed through a `ProjectMember` junction table, which also stores specific project-level roles.
- **Tasks to Projects/Users**: Tasks are firmly linked to a parent `project_id`, assigned to an `assigned_to` User ID, and created by a `creator_id`.
- Cascading deletes are configured to ensure database hygiene (e.g., deleting a project removes its associated tasks).

### 3. Validations & Error Handling
- **Pre-Database Validation**: Pydantic models automatically reject invalid data (e.g., missing fields, malformed emails, invalid enum statuses) with a `422 Unprocessable Entity` response before hitting the database.
- **Graceful Error Handling**: Custom `HTTPException` triggers are used throughout the FastAPI routers to return precise status codes (`404 Not Found`, `403 Forbidden`, `400 Bad Request`), which the frontend intercepts to display user-friendly toast notifications.

---

