import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export default class ProjectService {
  constructor() {
    this._projectsFilePath = null;
  }

  get projectsFilePath() {
    if (!this._projectsFilePath) {
      const userDataPath = app.getPath('userData');
      this._projectsFilePath = path.join(userDataPath, 'projects.json');
      this.init();
    }
    return this._projectsFilePath;
  }

  init() {
    if (!fs.existsSync(this.projectsFilePath)) {
      fs.writeFileSync(this.projectsFilePath, JSON.stringify({ projects: [] }, null, 2));
    }
  }

  getProjects() {
    const data = fs.readFileSync(this.projectsFilePath, 'utf-8');
    return JSON.parse(data).projects;
  }

  saveProject(project) {
    const data = JSON.parse(fs.readFileSync(this.projectsFilePath, 'utf-8'));
    const index = data.projects.findIndex(p => p.id === project.id);
    
    if (index !== -1) {
      data.projects[index] = { ...data.projects[index], ...project };
    } else {
      data.projects.push(project);
    }

    fs.writeFileSync(this.projectsFilePath, JSON.stringify(data, null, 2));
    return project;
  }

  deleteProject(projectId) {
    const data = JSON.parse(fs.readFileSync(this.projectsFilePath, 'utf-8'));
    data.projects = data.projects.filter(p => p.id !== projectId);
    fs.writeFileSync(this.projectsFilePath, JSON.stringify(data, null, 2));
  }
}
