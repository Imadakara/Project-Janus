// Единый механизм для окон поверх интерфейса терминала (результат игры, выбор фигуры
// при превращении пешки и т.д.) — непрозрачная подложка на весь экран блокирует клики по
// остальному интерфейсу (fixed + inset-0 перекрывает всё в стеке отрисовки), контент окна
// отрисовывается поверх нужным вызывающим компонентом через children.
export function Modal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0, 0, 0, 0.75)" }}
    >
      <div
        className={`p-6 ${className ?? ""}`}
        style={{
          border: "2px solid var(--color-amber-dim)",
          background: "var(--color-crt-bg-raised)",
          minWidth: 260,
          maxWidth: 400,
        }}
      >
        {children}
      </div>
    </div>
  );
}
