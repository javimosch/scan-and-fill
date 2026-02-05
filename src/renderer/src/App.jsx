import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import ProjectForm from './components/ProjectForm'
import ExecutionView from './components/ExecutionView'

function App() {
  const [screen, setScreen] = useState('dashboard')
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const data = await window.api.getProjects()
      setProjects(data || [])
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  const handleCreateProject = () => {
    setCurrentProject({
      id: Date.now().toString(),
      name: '',
      rootPath: '',
      categoryMapping: {},
      excelConfig: {
        filePath: '',
        sheetName: '',
        monthStartCell: 'A2',
        categoryColumn: 'B',
        categoryRowsMap: {}
      }
    })
    setScreen('project-form')
  }

  const handleEditProject = (project) => {
    setCurrentProject(project)
    setScreen('project-form')
  }

  const handleRunProject = (project) => {
    setCurrentProject(project)
    setScreen('execution')
  }

  const handleSaveProject = async (project) => {
    await window.api.saveProject(project)
    await loadProjects()
    setScreen('dashboard')
  }

  const handleDeleteProject = async (id) => {
    if (confirm('Are you sure you want to delete this project?')) {
      await window.api.deleteProject(id)
      await loadProjects()
    }
  }

  return (
    <div className="app-container">
      <header className="flex-between" style={{ marginBottom: '2rem' }}>
        <h1 style={{ background: 'linear-gradient(to right, #c026d3, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800 }}>
          scan-and-fill
        </h1>
        {screen !== 'dashboard' && (
          <button className="btn-ghost" onClick={() => setScreen('dashboard')}>
            Back to Dashboard
          </button>
        )}
      </header>

      <main>
        {screen === 'dashboard' && (
          <Dashboard
            projects={projects}
            onCreate={handleCreateProject}
            onEdit={handleEditProject}
            onDelete={handleDeleteProject}
            onRun={handleRunProject}
          />
        )}
        {screen === 'project-form' && (
          <ProjectForm
            project={currentProject}
            onSave={handleSaveProject}
            onCancel={() => setScreen('dashboard')}
          />
        )}
        {screen === 'execution' && (
          <ExecutionView
            project={currentProject}
            onClose={() => setScreen('dashboard')}
          />
        )}
      </main>
    </div>
  )
}

export default App
