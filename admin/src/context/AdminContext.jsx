import { createContext, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";

export const AdminContext = createContext();

const AdminContextProvider = ({ children }) => {
    const [aToken, setAToken] = useState(localStorage.getItem("aToken"));
    const [dashData, setDashData] = useState(null);
    const [appointments, setAppointments] = useState([]);
    const [treatments, setTreatments] = useState([]);

    const backendUrl = import.meta.env.VITE_BACKEND_URL;

    // Configure axios headers
    const getHeaders = () => ({
        token: aToken
    });

    // Function to get dashboard data
    const getDashData = async () => {
        try {
            const { data } = await axios.get(
                backendUrl + "/api/admin/get-dash-data", 
                { headers: getHeaders() }
            );
            if (data.success) {
                // Ensure all numeric values are properly initialized
                if (data.latestAppointments) {
                    data.latestAppointments = data.latestAppointments.map(appointment => ({
                        ...appointment,
                        amount: Number(appointment.amount || 0),
                        paidAmount: Number(appointment.paidAmount || 0)
                    }));
                }
                setDashData(data);
            }
        } catch (error) {
            console.log(error);
            if (error.response?.status === 401) {
                localStorage.removeItem("aToken");
                setAToken(null);
                window.location.href = '/login';
            }
        }
    };

    // Function to get all appointments
    const getAllAppointments = async () => {
        try {
            const { data } = await axios.get(
                backendUrl + "/api/admin/get-all-appointments", 
                { headers: getHeaders() }
            );
            if (data.success) {
                setAppointments(data.appointments);
            }
        } catch (error) {
            console.log(error);
            if (error.response?.status === 401) {
                localStorage.removeItem("aToken");
                setAToken(null);
                window.location.href = '/login';
            }
        }
    };

    // Function to get all treatments
    const getAllTreatments = async () => {
        try {
            const { data } = await axios.get(backendUrl + "/api/treatment/list");
            if (data.success) {
                setTreatments(data.treatments || []);
            }
        } catch (error) {
            console.log(error);
            toast.error("Failed to load treatments");
        }
    };

    // Function to change treatment availability
    const changeAvailability = async (treatmentId) => {
        try {
            const { data } = await axios.post(
                backendUrl + "/api/treatment/change-availability",
                { docId: treatmentId },
                { headers: getHeaders() }
            );
            if (data.success) {
                toast.success("Availability updated");
                getAllTreatments();
                return true;
            }
            toast.error(data.message);
            return false;
        } catch (error) {
            console.log(error);
            toast.error("Failed to update availability");
            return false;
        }
    };

    // Function to delete treatment
    const deleteTreatment = async (treatmentId) => {
        try {
            const { data } = await axios.post(
                backendUrl + "/api/admin/delete-treatment",
                { treatmentId },
                { headers: getHeaders() }
            );
            if (data.success) {
                toast.success("Treatment deleted");
                getAllTreatments();
                return true;
            }
            toast.error(data.message);
            return false;
        } catch (error) {
            console.log(error);
            toast.error("Failed to delete treatment");
            return false;
        }
    };

    // Function to cancel appointment
    const cancelAppointment = async (appointmentId) => {
        try {
            const { data } = await axios.post(
                backendUrl + "/api/admin/cancel-appointment",
                { appointmentId },
                { headers: getHeaders() }
            );

            if (data.success) {
                toast.success(data.message);
                getDashData();
                return true;
            } else {
                toast.error(data.message);
                return false;
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message);
            return false;
        }
    };

    // Function to complete appointment
    const completeAppointment = async (appointmentId) => {
        try {
            const { data } = await axios.post(
                backendUrl + "/api/admin/complete-appointment",
                { appointmentId },
                { headers: getHeaders() }
            );

            if (data.success) {
                toast.success(data.message);
                getDashData();
                return true;
            } else {
                toast.error(data.message);
                return false;
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message);
            return false;
        }
    };

    // Function to delete appointment
    const deleteAppointment = async (appointmentId) => {
        try {
            const { data } = await axios.post(
                backendUrl + "/api/admin/delete-appointment",
                { appointmentId },
                { headers: getHeaders() }
            );

            if (data.success) {
                toast.success(data.message);
                getDashData();
                return true;
            } else {
                toast.error(data.message);
                return false;
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message);
            return false;
        }
    };

    // Function to accept balance payment
    const acceptBalancePayment = async (appointmentId, paymentMethod) => {
        try {
            const { data } = await axios.post(
                backendUrl + "/api/admin/accept-balance-payment",
                { appointmentId, paymentMethod },
                { headers: getHeaders() }
            );

            if (data.success) {
                toast.success(data.message);
                getDashData();
                return true;
            } else {
                toast.error(data.message);
                return false;
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message);
            return false;
        }
    };

    // Function to credit user's account
    const creditUserAccount = async (userId, amount, appointmentId) => {
        try {
            // Validate amount
            const creditAmount = Number(amount);
            if (isNaN(creditAmount) || creditAmount <= 0) {
                toast.error('Invalid credit amount');
                return false;
            }

            const { data } = await axios.post(
                backendUrl + "/api/admin/credit-user-account",
                { 
                    userId, 
                    amount: creditAmount,
                    appointmentId: appointmentId.toString()
                },
                { headers: getHeaders() }
            );

            if (data.success) {
                toast.success(data.message);
                getDashData();
                return true;
            } else {
                toast.error(data.message);
                return false;
            }
        } catch (error) {
            console.error('Credit User Account Error:', error);
            toast.error(error.response?.data?.message || error.message);
            return false;
        }
    };

    return (
        <AdminContext.Provider value={{
            aToken,
            setAToken,
            dashData,
            appointments,
            treatments,
            getDashData,
            getAllAppointments,
            getAllTreatments,
            changeAvailability,
            deleteTreatment,
            cancelAppointment,
            completeAppointment,
            deleteAppointment,
            acceptBalancePayment,
            creditUserAccount
        }}>
            {children}
        </AdminContext.Provider>
    );
};

export default AdminContextProvider;
