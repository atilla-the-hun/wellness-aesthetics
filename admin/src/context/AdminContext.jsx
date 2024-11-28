import axios from "axios";
import { createContext, useState, useEffect } from "react";
import { toast } from "react-toastify";

export const AdminContext = createContext()

const AdminContextProvider = (props) => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL
    const [aToken, setAToken] = useState(localStorage.getItem('aToken') || '')
    const [appointments, setAppointments] = useState([])
    const [treatments, setTreatments] = useState([])
    const [dashData, setDashData] = useState(false)

    // Function to update axios headers
    const updateAxiosHeaders = (token) => {
        if (token) {
            // Set token in multiple formats to handle different cases
            axios.defaults.headers.common['aToken'] = token;
            axios.defaults.headers.common['atoken'] = token;
            axios.defaults.headers.common['ATOKEN'] = token;
            axios.defaults.headers.common['a-token'] = token;
        } else {
            delete axios.defaults.headers.common['aToken'];
            delete axios.defaults.headers.common['atoken'];
            delete axios.defaults.headers.common['ATOKEN'];
            delete axios.defaults.headers.common['a-token'];
        }
    }

    // Set up axios default header when component mounts and when token changes
    useEffect(() => {
        if (aToken) {
            console.log('Setting auth token:', aToken);
            updateAxiosHeaders(aToken);
        }
    }, [aToken]);

    // Function to accept balance payment
    const acceptBalancePayment = async (appointmentId, paymentMethod) => {
        try {
            const { data } = await axios.post(
                `${backendUrl}/api/admin/accept-balance`,
                { appointmentId, paymentMethod }
            )
            if (data.success) {
                toast.success(data.message)
                getDashData() // Refresh dashboard data
                return true
            } else {
                toast.error(data.message)
                return false
            }
        } catch (error) {
            toast.error(error.message)
            console.log(error)
            return false
        }
    }

    // Function to register a user as admin
    const adminRegisterUser = async (userData) => {
        try {
            const { data } = await axios.post(
                `${backendUrl}/api/admin/register-user`,
                userData
            )
            if (data.success) {
                toast.success(data.message)
                return data.userId
            } else {
                toast.error(data.message)
                return null
            }
        } catch (error) {
            toast.error(error.message)
            console.log(error)
            return null
        }
    }

    // Function to login a user as admin
    const adminLoginUser = async (email) => {
        try {
            const { data } = await axios.post(
                `${backendUrl}/api/admin/login-user`,
                { email }
            )
            if (data.success) {
                return data.userId
            } else {
                toast.error(data.message)
                return null
            }
        } catch (error) {
            toast.error(error.message)
            console.log(error)
            return null
        }
    }

    // Function to book appointment with cash/speed point payment
    const adminBookAppointment = async (appointmentData) => {
        try {
            const { data } = await axios.post(
                `${backendUrl}/api/admin/book-appointment`,
                appointmentData
            )
            if (data.success) {
                toast.success(data.message)
                getAllAppointments()
                return true
            } else {
                toast.error(data.message)
                return false
            }
        } catch (error) {
            toast.error(error.message)
            console.log(error)
            return false
        }
    }

    // Getting all Treatments data from Database using API
    const getAllTreatments = async () => {
        try {
            const { data } = await axios.get(`${backendUrl}/api/admin/all-treatments`)
            if (data.success) {
                setTreatments(data.treatments)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    // Function to get single treatment data
    const getTreatment = async (treatmentId) => {
        try {
            const { data } = await axios.post(
                `${backendUrl}/api/admin/get-treatment`,
                { treatmentId }
            )
            if (data.success) {
                return data.treatment
            } else {
                toast.error(data.message)
                return null
            }
        } catch (error) {
            toast.error(error.message)
            console.log(error)
            return null
        }
    }

    // Function to update treatment
    const updateTreatment = async (treatmentData) => {
        try {
            const { data } = await axios.post(
                `${backendUrl}/api/admin/update-treatment`,
                treatmentData
            )
            if (data.success) {
                toast.success(data.message)
                getAllTreatments()
                return true
            } else {
                toast.error(data.message)
                return false
            }
        } catch (error) {
            toast.error(error.message)
            console.log(error)
            return false
        }
    }

    // Function to change treatment availablity using API
    const changeAvailability = async (docId) => {
        try {
            const { data } = await axios.post(`${backendUrl}/api/admin/change-availability`, { docId })
            if (data.success) {
                toast.success(data.message)
                getAllTreatments()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    // Function to delete treatment
    const deleteTreatment = async (treatmentId) => {
        try {
            const { data } = await axios.post(`${backendUrl}/api/admin/delete-treatment`, { treatmentId })
            if (data.success) {
                toast.success(data.message)
                getAllTreatments()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    // Getting all appointment data from Database using API
    const getAllAppointments = async () => {
        try {
            const { data } = await axios.get(`${backendUrl}/api/admin/appointments`)
            if (data.success) {
                setAppointments(data.appointments)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    // Function to cancel appointment using API
    const cancelAppointment = async (appointmentId) => {
        try {
            const { data } = await axios.post(`${backendUrl}/api/admin/cancel-appointment`, { appointmentId })
            if (data.success) {
                toast.success(data.message)
                getAllAppointments()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
            console.log(error)
        }
    }

    // Function to complete appointment
    const completeAppointment = async (appointmentId) => {
        try {
            const { data } = await axios.post(`${backendUrl}/api/admin/complete-appointment`, { appointmentId })
            if (data.success) {
                toast.success(data.message)
                getAllAppointments()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    // Function to delete appointment
    const deleteAppointment = async (appointmentId) => {
        try {
            const { data } = await axios.post(`${backendUrl}/api/admin/delete-appointment`, { appointmentId })
            if (data.success) {
                toast.success(data.message)
                getAllAppointments()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    // Getting Admin Dashboard data from Database using API
    const getDashData = async () => {
        try {
            const { data } = await axios.get(`${backendUrl}/api/admin/dashboard`)
            if (data.success) {
                setDashData(data.dashData)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    const value = {
        backendUrl,
        aToken, 
        setAToken: (token) => {
            console.log('Setting new token:', token);
            setAToken(token);
            updateAxiosHeaders(token);  // Update headers immediately when token changes
            if (token) {
                localStorage.setItem('aToken', token);
            } else {
                localStorage.removeItem('aToken');
            }
        },
        treatments,
        getAllTreatments,
        getTreatment,
        updateTreatment,
        changeAvailability,
        deleteTreatment,
        appointments,
        getAllAppointments,
        getDashData,
        cancelAppointment,
        completeAppointment,
        deleteAppointment,
        dashData,
        adminRegisterUser,
        adminLoginUser,
        adminBookAppointment,
        acceptBalancePayment
    }

    return (
        <AdminContext.Provider value={value}>
            {props.children}
        </AdminContext.Provider>
    )
}

export default AdminContextProvider
