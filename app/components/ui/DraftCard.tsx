interface DraftCardProps {
  name: string;
  thumbnail?: string;
  updatedAt: Date;
  onClick?: () => void;
  className?: string;
}

export function DraftCard({ name, thumbnail, updatedAt, onClick, className = "" }: DraftCardProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("de-DE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left bg-cream-50 border border-cream-200 rounded-lg p-4
        hover:border-terracotta-400 hover:shadow-md
        active:scale-[0.98]
        transition-all duration-200
        dark:bg-night-800 dark:border-night-600 dark:hover:border-terracotta-400
        ${className}
      `.trim()}
    >
      <div className="aspect-video bg-cream-200 dark:bg-night-700 rounded-md mb-3 overflow-hidden">
        {thumbnail ? (
          <img src={thumbnail} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sand-400 dark:text-sand-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      <h3 className="font-medium text-brown-800 dark:text-cream-100 truncate mb-1">
        {name}
      </h3>
      <p className="text-xs text-sand-500 dark:text-sand-400">
        {formatDate(updatedAt)}
      </p>
    </button>
  );
}