import React, { useContext, useEffect, useState } from 'react'
import { assets } from '../../assets/assets'
import { AdminContext } from '../../context/AdminContext'
import { AppContext } from '../../context/AppContext'
import { toast } from 'react-toastify'

// Function to format payment history
const formatPaymentHistory = (transactionDetails, currency) => {
    if (!transactionDetails || transactionDetails.length === 0) return 'No payments recorded'
    
    return transactionDetails.map((transaction, index) => (
        <div key={index} className='text-xs mt-1'>
            <span className={`${
                transaction.paymentType === 'credit_refund' ? 'text-green-600' : 'text-gray-600'
            }`}>
                {new Date(transaction.date).toLocaleDateString()} - {currency}{Number(transaction.amount || 0).toFixed(2)} 
                ({transaction.paymentType === 'full' ? 'Full Payment' : 
                  transaction.paymentType === 'partial' ? 'Partial Payment' : 
                  transaction.paymentType === 'credit' ? 'Credit Balance' :
                  transaction.paymentType === 'credit_refund' ? 'Credit Refund' :
                  'Balance Payment'})
                {transaction.paymentMethod && ` via ${
                    transaction.paymentMethod === 'credit_balance' ? 'Credit Balance' :
                    transaction.paymentMethod === 'payfast' ? 'PayFast' :
                    transaction.paymentMethod === 'admin_credit' ? 'Admin Credit' :
                    transaction.paymentMethod
                }`}
                {transaction.description && ` - ${transaction.description}`}
            </span>
        </div>
    ))
}

const Dashboard = () => {
    const { getDashData, cancelAppointment, completeAppointment, deleteAppointment, dashData, acceptBalancePayment, creditUserAccount } = useContext(AdminContext)
    const { slotDateFormat, calculateAge, currency } = useContext(AppContext)
    const [showCreditModal, setShowCreditModal] = useState(false)
    const [selectedAppointmentForCredit, setSelectedAppointmentForCredit] = useState(null)
    const [filteredAppointments, setFilteredAppointments] = useState([])
    const [totalEarnings, setTotalEarnings] = useState(0)
    const [totalInvoices, setTotalInvoices] = useState(0)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [selectedAppointment, setSelectedAppointment] = useState(null)
    const [paymentMethod, setPaymentMethod] = useState('cash')

    // Function to calculate end time
    const calculateEndTime = (startTime, duration) => {
        if (!startTime || !duration) return '';
        const [hours, minutes] = startTime.split(':').map(Number);
        let totalMinutes = hours * 60 + minutes + Number(duration);
        
        const endHours = Math.floor(totalMinutes / 60);
        const endMinutes = totalMinutes % 60;
        
        return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
    }

    // Function to get payment status display
    const getPaymentStatusDisplay = (appointment) => {
        const paidAmount = Number(appointment.paidAmount || 0);
        const totalAmount = Number(appointment.amount || 0);
        const remainingBalance = totalAmount - paidAmount;

        // Get payment methods from transaction details
        const paymentMethods = appointment.transactionDetails
            ?.map(t => t.paymentMethod)
            .filter(Boolean)
            .map(method => 
                method === 'credit_balance' ? 'Credit' :
                method === 'payfast' ? 'PayFast' :
                method === 'admin_credit' ? 'Admin Credit' :
                method
            );

        const uniquePaymentMethods = [...new Set(paymentMethods)];
        const paymentMethodsText = uniquePaymentMethods.length > 0 
            ? ` (via ${uniquePaymentMethods.join(' & ')})` 
            : '';

        if (appointment.cancelled && appointment.paymentStatus === 'none') {
            return {
                text: 'Unpaid - cancelled on checkout',
                color: 'text-red-500',
                paidAmount: 0,
                remainingBalance: 0
            }
        } else if (appointment.paymentStatus === 'full') {
            return {
                text: `Paid in Full${paymentMethodsText}`,
                color: 'text-green-500',
                paidAmount: totalAmount,
                remainingBalance: 0
            }
        } else if (appointment.paymentStatus === 'partial') {
            return {
                text: `Partially paid${paymentMethodsText}`,
                color: 'text-orange-500',
                paidAmount: paidAmount,
                remainingBalance: remainingBalance
            }
        } else {
            return {
                text: 'Unpaid',
                color: 'text-red-500',
                paidAmount: 0,
                remainingBalance: totalAmount
            }
        }
    }

    // Function to handle crediting user's account
    const handleCreditUser = async () => {
        if (!selectedAppointmentForCredit) return;

        const success = await creditUserAccount(
            selectedAppointmentForCredit.userId,
            selectedAppointmentForCredit.paidAmount || 0,
            selectedAppointmentForCredit._id
        );

        if (success) {
            setShowCreditModal(false);
            setSelectedAppointmentForCredit(null);
            getDashData(); // Refresh dashboard data
        }
    };

    // Function to handle balance payment
    const handleBalancePayment = async () => {
        if (!selectedAppointment) return;

        const success = await acceptBalancePayment(selectedAppointment._id, paymentMethod);
        if (success) {
            setShowPaymentModal(false);
            setSelectedAppointment(null);
            setPaymentMethod('cash');
            getDashData(); // Refresh dashboard data
        }
    }

    useEffect(() => {
        getDashData()
    }, [])

    useEffect(() => {
        if (dashData?.latestAppointments) {
            const earnings = dashData.latestAppointments.reduce((total, appointment) => 
                total + Number(appointment.paidAmount || 0), 0);
            const invoices = dashData.latestAppointments.reduce((total, appointment) => 
                total + Number(appointment.amount || 0), 0);
            setTotalEarnings(earnings);
            setTotalInvoices(invoices);
        }
    }, [dashData])

    if (!dashData) {
        return (
            <div className='m-5 flex justify-center items-center'>
                <p className='text-gray-600'>Loading dashboard data...</p>
            </div>
        )
    }

    return (
        <>
            <div className='m-5'>
                <div className='flex flex-wrap gap-3'>
                    <div className='flex items-center gap-2 bg-white p-4 min-w-52 rounded border-2 border-gray-100 hover:scale-105 transition-all'>
                        <img className='w-14' src={assets.treatment_icon} alt="" />
                        <div>
                            <p className='text-xl font-semibold text-gray-600'>{dashData.treatments || 0}</p>
                            <p className='text-gray-400'>Treatments</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-2 bg-white p-4 min-w-52 rounded border-2 border-gray-100 hover:scale-105 transition-all'>
                        <img className='w-14' src={assets.appointments_icon} alt="" />
                        <div>
                            <p className='text-xl font-semibold text-gray-600'>{dashData.appointments || 0}</p>
                            <p className='text-gray-400'>Appointments</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-2 bg-white p-4 min-w-52 rounded border-2 border-gray-100 hover:scale-105 transition-all'>
                        <img className='w-14' src={assets.patients_icon} alt="" />
                        <div>
                            <p className='text-xl font-semibold text-gray-600'>{dashData.patients || 0}</p>
                            <p className='text-gray-400'>Clients</p>
                        </div>
                    </div>
                </div>

                <div className='bg-white mt-5 p-4 rounded border'>
                    <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4'>
                        <div>
                            <p className='text-xl font-semibold'>Total Bookings: {currency} {totalInvoices.toFixed(2)}</p>
                            <p className='text-xl font-semibold mt-2'>Received: {currency} {totalEarnings.toFixed(2)}</p>
                        </div>
                    </div>

                    <div className='pt-4 border border-t-0'>
                        {(dashData.latestAppointments || []).map((item, index) => {
                            const paymentStatusStyle = getPaymentStatusDisplay(item)
                            const endTime = calculateEndTime(item.slotTime, item.duration)
                            const showCreditButton = item.cancelled && 
                                               (item.paidAmount || 0) > 0 && 
                                               !item.creditProcessed;

                            return (
                                <div className='flex items-center px-6 py-3 gap-3 hover:bg-gray-100' key={index}>
                                    <div className='flex-1 text-sm'>
                                        <div className='flex justify-between items-start'>
                                            <div>
                                                <p className={`px-2 py-1 rounded-full ${paymentStatusStyle.color}`}>
                                                    {paymentStatusStyle.text}
                                                </p>
                                                <p className='text-gray-800 font-medium'>{item.docData?.name}</p>
                                                <p className='text-gray-600'>Practitioner: <span className='text-black'>{item.practitioner}</span></p>
                                                <p className='text-gray-600'>Booking Number: <span className='text-black'>{item.bookingNumber}</span></p>
                                            </div>
                                        </div>

                                        <div className='mt-4 grid grid-cols-1 gap-4'>
                                            <div>
                                                <img className='rounded-full w-20' src={item.userData?.image} alt="" />
                                                <p className='text-gray-600'>Client Name: <span className='text-black'>{item.userData?.name}</span></p>
                                                <p className='text-gray-600'>Client Email: <span className='text-black'>{item.userData?.email}</span></p>
                                                <p className='text-gray-600'>Client Telephone: <span className='text-black'>{item.userData?.phone}</span></p>
                                                <p className='text-gray-600'>Client Age: <span className='text-black'>{calculateAge(item.userData?.dob)}</span></p>
                                                <p className='text-gray-600'>Booking for: <span className='text-black'>
                                                    {slotDateFormat(item.slotDate)}, {item.slotTime} to {endTime} ({item.duration || 0} min)
                                                </span></p>
                                                <p className='text-gray-600 font-medium'>Payment History:</p>
                                                {formatPaymentHistory(item.transactionDetails, currency)}
                                                {paymentStatusStyle.remainingBalance > 0 && !item.cancelled && (
                                                    <div>
                                                        <p className='text-gray-600 mt-2'>
                                                            Remaining Balance: <span className='text-black'>{currency}{paymentStatusStyle.remainingBalance.toFixed(2)}</span>
                                                        </p>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedAppointment(item)
                                                                setShowPaymentModal(true)
                                                            }}
                                                            className='mt-2 bg-primary text-white px-4 py-1 rounded text-sm hover:bg-primary/90'
                                                        >
                                                            Balance Payment
                                                        </button>
                                                    </div>
                                                )}
                                                {showCreditButton && (
                                                    <div className="mt-2">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedAppointmentForCredit(item);
                                                                setShowCreditModal(true);
                                                            }}
                                                            className="bg-green-500 text-white px-4 py-1 rounded text-sm hover:bg-green-600"
                                                        >
                                                            Credit Amount to User
                                                        </button>
                                                    </div>
                                                )}
                                                <p className='text-gray-600 mt-1'>
                                                    Paid: <span className='text-black'>{currency}{paymentStatusStyle.paidAmount.toFixed(2)}</span> / 
                                                    Total: <span className='text-black'>{currency}{(item.amount || 0).toFixed(2)}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className='mt-4 pb-[50px]'>
                                            {item.cancelled ? (
                                                <p className='text-red-400 text-xs font-medium'>Cancelled</p>
                                            ) : item.isCompleted ? (
                                                <p className='text-green-500 text-xs font-medium'>Completed</p>
                                            ) : (
                                                <div className='flex items-center gap-2'>
                                                    <img onClick={() => cancelAppointment(item._id)} className='w-10 cursor-pointer' src={assets.cancel_icon} alt="" title="Cancel Appointment" />
                                                    <img onClick={() => completeAppointment(item._id)} className='w-10 cursor-pointer' src={assets.tick_icon} alt="" title="Mark as Completed" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Credit Modal */}
            {showCreditModal && selectedAppointmentForCredit && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg w-96">
                        <h2 className="text-xl font-semibold mb-4">Credit Amount to User</h2>
                        <div className="mb-4">
                            <p>User: {selectedAppointmentForCredit.userData?.name}</p>
                            <p>Amount to Credit: {currency}{(selectedAppointmentForCredit.paidAmount || 0).toFixed(2)}</p>
                            <p className="text-sm text-gray-500 mt-2">
                                This amount will be added to the user's account balance and can be used for future appointments.
                            </p>
                        </div>
                        <div className="flex justify-end gap-4">
                            <button
                                onClick={() => {
                                    setShowCreditModal(false);
                                    setSelectedAppointmentForCredit(null);
                                }}
                                className="px-4 py-2 border rounded hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreditUser}
                                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                            >
                                Confirm Credit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && selectedAppointment && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg w-96">
                        <h2 className="text-xl font-semibold mb-4">Accept Balance Payment</h2>
                        <p className="mb-4">
                            Amount: {currency}
                            {((selectedAppointment.amount || 0) - (selectedAppointment.paidAmount || 0)).toFixed(2)}
                        </p>
                        <div className="mb-4">
                            <label className="block mb-2">Payment Method:</label>
                            <div className="flex gap-4">
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        value="cash"
                                        checked={paymentMethod === 'cash'}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="mr-2"
                                    />
                                    Cash
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        value="speed_point"
                                        checked={paymentMethod === 'speed_point'}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="mr-2"
                                    />
                                    Speed Point
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-4">
                            <button
                                onClick={() => {
                                    setShowPaymentModal(false)
                                    setSelectedAppointment(null)
                                    setPaymentMethod('cash')
                                }}
                                className="px-4 py-2 border rounded hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBalancePayment}
                                className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
                            >
                                Accept Payment
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default Dashboard
