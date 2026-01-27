import { useState, useEffect } from 'react';
import api from '../utils/api';

function Dashboard({ user }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const endpoint = user.role === 'manager' ? '/dashboard/stats' : '/dashboard/employee';
            const response = await api.get(endpoint);
            
            if (response.data.success) {
                setStats(response.data.data);
            }
        } catch (err) {
            setError('Failed to load dashboard');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Simple derived data for manager visualization: today's check-ins per employee
    const employeeCheckinCounts = stats?.today_checkins
        ? stats.today_checkins.reduce((acc, checkin) => {
              const key = checkin.employee_name || 'Unknown';
              acc[key] = (acc[key] || 0) + 1;
              return acc;
          }, {})
        : null;

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
            </div>
        );
    }

    // Manager Dashboard
    if (user.role === 'manager') {
        const entries = employeeCheckinCounts ? Object.entries(employeeCheckinCounts) : [];
        const maxCount = entries.length > 0 ? Math.max(...entries.map(([_, count]) => count)) : 0;

        return (
            <div>
                <h2 className="text-2xl font-bold mb-6">Manager Dashboard</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-gray-500 text-sm">Team Size</h3>
                        <p className="text-3xl font-bold text-blue-600">{stats?.team_size || 0}</p>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-gray-500 text-sm">Active Check-ins</h3>
                        <p className="text-3xl font-bold text-green-600">{stats?.active_checkins || 0}</p>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-gray-500 text-sm">Today's Visits</h3>
                        <p className="text-3xl font-bold text-purple-600">{stats?.today_checkins?.length || 0}</p>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow">
                    <h3 className="text-lg font-semibold p-4 border-b">Today's Activity</h3>
                    <div className="p-4">
                        {stats?.today_checkins?.length > 0 ? (
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-gray-500 text-sm">
                                        <th className="pb-3">Employee</th>
                                        <th className="pb-3">Client</th>
                                        <th className="pb-3">Check-in Time</th>
                                        <th className="pb-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.today_checkins.map((checkin) => (
                                        <tr key={checkin.id} className="border-t">
                                            <td className="py-3">{checkin.employee_name}</td>
                                            <td className="py-3">{checkin.client_name}</td>
                                            <td className="py-3">
                                                {new Date(checkin.checkin_time).toLocaleTimeString()}
                                            </td>
                                            <td className="py-3">
                                                <span className={`px-2 py-1 rounded text-xs ${
                                                    checkin.status === 'checked_in' 
                                                        ? 'bg-green-100 text-green-800' 
                                                        : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {checkin.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-gray-500">No check-ins today</p>
                        )}
                    </div>
                </div>

                {/* Simple visualization: bar chart of today's check-ins per employee */}
                <div className="bg-white rounded-lg shadow mt-8">
                    <h3 className="text-lg font-semibold p-4 border-b">Today's Check-ins by Employee</h3>
                    <div className="p-4">
                        {entries.length > 0 ? (
                            <div className="space-y-3">
                                {entries.map(([name, count]) => {
                                    const widthPercent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                    return (
                                        <div key={name}>
                                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                                                <span className="font-medium">{name}</span>
                                                <span>{count} check-in{count > 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-2">
                                                <div
                                                    className="h-2 rounded-full bg-blue-500"
                                                    style={{ width: `${widthPercent}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">No check-ins to visualize yet.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Employee Dashboard
    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">My Dashboard</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-gray-500 text-sm">Assigned Clients</h3>
                    <p className="text-3xl font-bold text-blue-600">{stats?.assigned_clients?.length || 0}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-gray-500 text-sm">This Week's Visits</h3>
                    <p className="text-3xl font-bold text-green-600">{stats?.week_stats?.total_checkins || 0}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-gray-500 text-sm">Today's Check-ins</h3>
                    <p className="text-3xl font-bold text-purple-600">{stats?.today_checkins?.length || 0}</p>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow">
                <h3 className="text-lg font-semibold p-4 border-b">My Clients</h3>
                <div className="p-4">
                    {stats?.assigned_clients?.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {stats.assigned_clients.map((client) => (
                                <div key={client.id} className="border rounded-lg p-4">
                                    <h4 className="font-semibold">{client.name}</h4>
                                    <p className="text-sm text-gray-500">{client.address}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-500">No clients assigned</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
