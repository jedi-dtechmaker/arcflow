import React from "react";
import { Plus, User } from "lucide-react";

export function QuickTransferBar({ recentContacts = [], onSelectContact, onNewTransfer }) {
  // Fallback default sample contacts if user hasn't made transfers yet
  const defaultContacts = [
    { name: "Amin Soleymani", identifier: "amin@arc.network", seed: "Amin" },
    { name: "Bardia Adibi", identifier: "bardia@arc.network", seed: "Bardia" },
    { name: "Sarah Chen", identifier: "sarah@arc.network", seed: "Sarah" },
    { name: "Alex Rivers", identifier: "alex@arc.network", seed: "Alex" }
  ];

  const contactsToDisplay = recentContacts.length > 0 ? recentContacts : defaultContacts;

  return (
    <div className="w-full mt-6">
      <div className="flex items-center justify-between px-1 mb-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Quick Transfer</h3>
        <button
          onClick={onNewTransfer}
          className="text-[10px] font-black uppercase tracking-widest text-violet-400 hover:text-violet-300 transition"
        >
          View All
        </button>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1 px-1">
        {/* Add New Contact Button */}
        <button
          onClick={onNewTransfer}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 border border-dashed border-white/20 text-slate-400 group-hover:border-violet-500 group-hover:text-violet-400 transition-all">
            <Plus className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-300">Add</span>
        </button>

        {/* Contact Avatars */}
        {contactsToDisplay.map((contact, idx) => {
          const seedName = contact.seed || contact.name || contact.identifier || `User${idx}`;
          const displayName = contact.name || (contact.identifier?.length > 12 ? `${contact.identifier.slice(0, 8)}...` : contact.identifier);
          const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seedName)}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

          return (
            <button
              key={contact.identifier || idx}
              onClick={() => onSelectContact(contact.identifier)}
              className="flex flex-col items-center gap-1.5 shrink-0 group max-w-[4.5rem]"
            >
              <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-0.5 shadow-md group-hover:scale-105 group-hover:border-violet-500/50 transition-all">
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-full w-full rounded-xl object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="hidden h-full w-full items-center justify-center rounded-xl bg-violet-600/30 text-white font-bold text-xs">
                  {seedName.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <span className="truncate text-[10px] font-bold text-slate-300 group-hover:text-white transition">
                {displayName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
