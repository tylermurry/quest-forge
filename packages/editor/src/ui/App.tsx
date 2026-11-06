// Editor shell (spec 08). Components stay thin: logic lives in src/model.
export function App() {
  return (
    <div className="shell">
      <aside className="browser">Project</aside>
      <main className="tabs">Editor</main>
      <aside className="inspector">Inspector</aside>
      <footer className="dock">Problems</footer>
    </div>
  );
}
