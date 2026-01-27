import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    PieChart,
    Pie,
    Cell
} from 'recharts';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];

function buildEmployeeData(todayCheckins) {
    const counts = todayCheckins.reduce((acc, checkin) => {
        const key = checkin.employee_name || 'Unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    return Object.entries(counts).map(([name, count]) => ({ name, checkins: count }));
}

function buildClientData(todayCheckins) {
    const counts = todayCheckins.reduce((acc, checkin) => {
        const key = checkin.client_name || 'Unknown client';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function ManagerCharts({ todayCheckins }) {
    if (!todayCheckins || todayCheckins.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow mt-8">
                <h3 className="text-lg font-semibold p-4 border-b">Today's Check-ins</h3>
                <div className="p-6 text-gray-500 text-sm">
                    No check-ins to visualize yet. Charts will appear here once your team starts checking in.
                </div>
            </div>
        );
    }

    const employeeData = buildEmployeeData(todayCheckins);
    const clientData = buildClientData(todayCheckins);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            <div className="bg-white rounded-lg shadow">
                <h3 className="text-lg font-semibold p-4 border-b">Check-ins by Employee</h3>
                <div className="p-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={employeeData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 11 }}
                                interval={0}
                                angle={-25}
                                textAnchor="end"
                                height={50}
                            />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="checkins" name="Check-ins" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow">
                <h3 className="text-lg font-semibold p-4 border-b">Check-ins by Client</h3>
                <div className="p-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={clientData}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                dataKey="value"
                                nameKey="name"
                                labelLine={false}
                                label={({ name, percent }) =>
                                    `${name} (${(percent * 100).toFixed(0)}%)`
                                }
                            >
                                {clientData.map((entry, index) => (
                                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}

export default ManagerCharts;

