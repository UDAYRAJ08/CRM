import React from 'react';
import { Compass, LayoutDashboard, Users, DollarSign, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/Button';

interface NotFoundViewProps {
  onNavigate: (view: 'dashboard' | 'contacts' | 'pipeline') => void;
  requestedView?: string;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({
  onNavigate,
  requestedView,
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center animate-in fade-in zoom-in-95 duration-200">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm mb-6">
        <Compass className="w-8 h-8 sm:w-10 sm:h-10 animate-pulse" />
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold mb-3 border border-rose-200/60">
        <span>Error 404</span>
        <span>•</span>
        <span>Route Not Found</span>
      </div>

      <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
        Lost in the CRM Workspace?
      </h2>

      <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
        {requestedView
          ? `The requested section "${requestedView}" could not be located in this CRM workspace.`
          : 'The page or resource you are searching for does not exist or has been relocated.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="primary"
          size="md"
          leftIcon={<LayoutDashboard className="w-4 h-4" />}
          onClick={() => onNavigate('dashboard')}
        >
          Return to Dashboard
        </Button>

        <Button
          variant="outline"
          size="md"
          leftIcon={<Users className="w-4 h-4" />}
          onClick={() => onNavigate('contacts')}
        >
          View Contacts
        </Button>

        <Button
          variant="outline"
          size="md"
          leftIcon={<DollarSign className="w-4 h-4" />}
          onClick={() => onNavigate('pipeline')}
        >
          Sales Pipeline
        </Button>
      </div>

      <div className="mt-8 text-xs text-slate-400 flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Use the sidebar or navigation menu above to jump between workspace tools.</span>
      </div>
    </div>
  );
};
