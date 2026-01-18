
import React, { useState, useEffect } from 'react';
import { Lock, User, ArrowRight, Factory, ShieldCheck, Cpu, Users, Plus, Trash2, LogOut, Settings, Save } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

interface UserCredential {
  id: string;
  username: string;
  pass: string;
}

// Default initial user if storage is empty
const INITIAL_USERS: UserCredential[] = [
  { id: 'default-1', username: 'Hino', pass: '1964' }
];

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  // Login Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Admin System State
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [users, setUsers] = useState<UserCredential[]>([]);
  
  // New User Form State
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');

  // Load users from localStorage on mount
  useEffect(() => {
    const savedUsers = localStorage.getItem('app_users');
    if (savedUsers) {
      setUsers(JSON.parse(savedUsers));
    } else {
      setUsers(INITIAL_USERS);
      localStorage.setItem('app_users', JSON.stringify(INITIAL_USERS));
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Simulate calculation for UX
    setTimeout(() => {
      // 1. Check for Admin
      if (username === 'Admin' && password === '1964') {
        setIsAdminMode(true);
        setIsLoading(false);
        setUsername('');
        setPassword('');
        return;
      }

      // 2. Check for Regular Users
      const foundUser = users.find(u => 
        u.username.toLowerCase() === username.toLowerCase() && u.pass === password
      );

      if (foundUser) {
        onLoginSuccess();
      } else {
        setError('Invalid credentials. Access denied.');
        setIsLoading(false);
      }
    }, 600);
  };

  // --- ADMIN ACTIONS ---
  const handleAddUser = () => {
    if (!newUser || !newPass) return;
    if (users.some(u => u.username.toLowerCase() === newUser.toLowerCase())) {
      alert("Username already exists!");
      return;
    }

    const updatedUsers = [...users, { id: crypto.randomUUID(), username: newUser, pass: newPass }];
    setUsers(updatedUsers);
    localStorage.setItem('app_users', JSON.stringify(updatedUsers));
    setNewUser('');
    setNewPass('');
  };

  const handleRemoveUser = (id: string) => {
    if (confirm("Are you sure you want to remove this user?")) {
      const updatedUsers = users.filter(u => u.id !== id);
      setUsers(updatedUsers);
      localStorage.setItem('app_users', JSON.stringify(updatedUsers));
    }
  };

  const handleAdminLogout = () => {
    setIsAdminMode(false);
    setError('');
  };

  // --- RENDER: ADMIN DASHBOARD ---
  if (isAdminMode) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans text-gray-100 relative overflow-hidden">
         {/* Background FX */}
         <div className="absolute inset-0 pointer-events-none">
             <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-3xl"></div>
             <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-900/20 rounded-full blur-3xl"></div>
         </div>

         <div className="w-full max-w-2xl bg-slate-800/80 backdrop-blur-xl border border-slate-600 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col">
            {/* Header */}
            <div className="bg-slate-900 p-6 border-b border-slate-700 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-600 rounded-lg shadow-lg shadow-red-900/50">
                        <Settings className="text-white" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">System Administration</h2>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">User Access Control</p>
                    </div>
                </div>
                <button onClick={handleAdminLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-300 hover:text-white transition-all">
                    <LogOut size={16} /> Logout
                </button>
            </div>

            {/* Content */}
            <div className="p-6 flex flex-col gap-6">
                
                {/* Add User Section */}
                <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600">
                    <h3 className="text-sm font-bold text-blue-400 mb-3 uppercase flex items-center gap-2">
                        <Plus size={16}/> Add New User
                    </h3>
                    <div className="flex gap-2">
                        <div className="relative flex-grow">
                            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input 
                                type="text" placeholder="Username" 
                                value={newUser} onChange={e => setNewUser(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-500 rounded-lg py-2 pl-9 pr-3 text-sm text-white focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="relative flex-grow">
                            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input 
                                type="text" placeholder="Password" 
                                value={newPass} onChange={e => setNewPass(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-500 rounded-lg py-2 pl-9 pr-3 text-sm text-white focus:border-blue-500 outline-none"
                            />
                        </div>
                        <button 
                            onClick={handleAddUser}
                            disabled={!newUser || !newPass}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2"
                        >
                            <Save size={18}/> Add
                        </button>
                    </div>
                </div>

                {/* User List */}
                <div>
                    <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase flex items-center gap-2">
                        <Users size={16}/> Registered Users ({users.length})
                    </h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {users.map((u) => (
                            <div key={u.id} className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold">
                                        {u.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">{u.username}</div>
                                        <div className="text-xs text-slate-500 font-mono">Pass: {u.pass}</div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleRemoveUser(u.id)}
                                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all opacity-60 group-hover:opacity-100"
                                    title="Remove User"
                                >
                                    <Trash2 size={18}/>
                                </button>
                            </div>
                        ))}
                        {users.length === 0 && (
                            <div className="text-center py-8 text-slate-500 italic">No users found.</div>
                        )}
                    </div>
                </div>
            </div>
         </div>
      </div>
    );
  }

  // --- RENDER: NORMAL LOGIN ---
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center relative overflow-hidden font-sans text-gray-100 selection:bg-blue-500 selection:text-white">
      
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
         <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-700 via-slate-900 to-black"></div>
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-900/20 rounded-full blur-3xl"></div>
      </div>

      <div className="z-10 w-full max-w-md px-6">
        {/* Branding */}
        <div className="text-center mb-10 space-y-2">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center shadow-2xl shadow-blue-900/50 transform rotate-3 border border-blue-400/30">
              <Factory size={32} className="text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-sm">
            WorkStudy<span className="text-blue-500">Pro</span>
          </h1>
          <p className="text-slate-400 text-sm tracking-widest uppercase font-semibold">
            Industrial Engineering Suite
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-8 relative">
           {/* Top Border Accent */}
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 rounded-t-2xl"></div>

          <form onSubmit={handleLogin} className="space-y-6 mt-2">
            
            {/* Username */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wide ml-1">Username</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-slate-900/80 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-600 text-sm transition-all text-white"
                  placeholder="Enter User ID"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wide ml-1">Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-slate-900/80 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-600 text-sm transition-all text-white"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-900/20 p-3 rounded border border-red-900/50 animate-pulse">
                <ShieldCheck size={14} />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 shadow-lg shadow-blue-900/50 transition-all ${isLoading ? 'opacity-80 cursor-not-allowed' : 'hover:scale-[1.02]'}`}
            >
              {isLoading ? (
                <>
                  <Cpu className="animate-spin" size={18} /> Authenticating...
                </>
              ) : (
                <>
                  Log In <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
        
        {/* System Status / Version */}
        <div className="mt-8 text-center flex justify-center gap-6 opacity-40">
           <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
              <span className="text-[10px] uppercase font-mono tracking-widest text-slate-300">System Active</span>
           </div>
           <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
              <span className="text-[10px] uppercase font-mono tracking-widest text-slate-300">v3.0.0 Secure</span>
           </div>
        </div>
      </div>

      {/* Footer Copyright - Fixed Bottom Right */}
      <div className="absolute bottom-4 right-6 text-right z-20">
        <p className="text-[10px] font-mono text-slate-500 font-bold opacity-60 hover:opacity-100 transition-opacity cursor-default">
          Copyright © 2026 HMMT
        </p>
      </div>
    </div>
  );
};
