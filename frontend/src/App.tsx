import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { EditorPage } from './pages/EditorPage'
import { LibraryPage } from './pages/LibraryPage'
import { PracticePage } from './pages/PracticePage'
import { SolutionRecorderPage } from './pages/SolutionRecorderPage'

export default function App() {
  return (
    <BrowserRouter>
      <header className="app-header">
        <h1>Open Chess</h1>
        <nav>
          <NavLink to="/" end>
            Library
          </NavLink>
          <NavLink to="/editor" end>
            New scenario
          </NavLink>
          <NavLink to="/practice" end>
            Free board
          </NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/editor" element={<EditorPage key="new" />} />
          <Route path="/editor/:id" element={<EditorPage />} />
          <Route path="/practice" element={<PracticePage key="adhoc" />} />
          <Route path="/practice/:id" element={<PracticePage />} />
          <Route path="/scenarios/:id/solution" element={<SolutionRecorderPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
