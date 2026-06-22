import { Bot } from "lucide-react";

export function ChatContent() {
  return (
    <div className="flex-1 overflow-y-auto px-10 py-10">
      {/* User Message */}
      <div className="flex justify-end mb-8">
        <div className="max-w-xl rounded-3xl px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          What was our total revenue in Q3?
        </div>
      </div>

      {/* Assistant Message */}
      <div className="max-w-4xl">
        <div className="flex gap-4">
          <div className="h-10 w-10 rounded-full bg-cyan-400 flex items-center justify-center">
            <Bot size={18} className="text-black" />
          </div>

          <div>
            <div className="card p-6">
              <p className="leading-8 text-lg">
                Based on the Q3 Financial Report, total revenue was{" "}
                <span className="text-cyan-400 font-semibold">
                  $42.7 million
                </span>
                , representing a{" "}
                <span className="text-cyan-400 font-semibold">15%</span>{" "}
                year-over-year increase.
              </p>
            </div>

            {/* Sources */}
            <div className="mt-6">
              <h3 className="text-secondary mb-4">Sources</h3>

              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((page) => (
                  <div key={page} className="card p-4">
                    <p className="font-medium text-cyan-400">Page {page + 7}</p>

                    <p className="text-sm mt-3 text-secondary">
                      Revenue increased across all regions...
                    </p>

                    <p className="mt-4 text-xs text-secondary">
                      Q3 Financial Report.pdf
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
