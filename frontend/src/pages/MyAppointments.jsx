import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import { assets } from '../assets/assets'

const MyAppointments = () => {
    const { backendUrl, token, currencySymbol } = useContext(AppContext)
    const navigate = useNavigate()

    const [appointments, setAppointments] = useState([])
    const [payment, setPayment] = useState('')
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [selectedAppointment, setSelectedAppointment] = useState(null)

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Function to format the date eg. ( 20_01_2000 => 20 Jan 2000 )
    const slotDateFormat = (slotDate) => {
        const dateArray = slotDate.split('_')
        return dateArray[0] + " " + months[Number(dateArray[1]) - 1] + " " + dateArray[2] // Subtracting 1 from month index
    }

    // Function to calculate end time
    const calculateEndTime = (startTime, duration) => {
        const [hours, minutes] = startTime.split(':').map(Number);
        let totalMinutes = hours * 60 + minutes + duration;
        
        const endHours = Math.floor(totalMinutes / 60);
        const endMinutes = totalMinutes % 60;
        
        return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
    }

    // Getting User Appointments Data Using API
    const getUserAppointments = async () => {
        try {
            const { data } = await axios.get(backendUrl + '/api/user/appointments', { headers: { token } })
            setAppointments(data.appointments.reverse())
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    // Function to cancel appointment Using API
    const cancelAppointment = async (appointmentId) => {
        try {
            const { data } = await axios.post(backendUrl + '/api/user/cancel-appointment', { appointmentId }, { headers: { token } })

            if (data.success) {
                toast.success(data.message)
                getUserAppointments()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    // Function to handle balance payment
    const handlePayBalance = (appointment) => {
        setSelectedAppointment(appointment)
        setShowPaymentModal(true)
    }

    // Function to process payment
    const processPayment = async () => {
        try {
            const { data } = await axios.post(
                backendUrl + '/api/user/payment-payfast',
                { appointmentId: selectedAppointment._id, paymentType: 'full' },
                { headers: { token } }
            )

            if (data.success) {
                // Handle PayFast payment
                const form = document.createElement('form')
                form.method = 'POST'
                form.action = data.payfast_url

                // Add all PayFast fields to the form
                Object.entries(data.paymentData).forEach(([key, value]) => {
                    const input = document.createElement('input')
                    input.type = 'hidden'
                    input.name = key
                    input.value = value
                    form.appendChild(input)
                })

                document.body.appendChild(form)
                form.submit()
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            console.log(error)
            toast.error(error.message)
        }
    }

    // Function to get payment status display
    const getPaymentStatus = (appointment) => {
        const totalAmount = appointment.amount || 0;
        const paidAmount = appointment.paidAmount || 0;
        const remainingBalance = totalAmount - paidAmount;

        if (appointment.paymentStatus === 'full') {
            return {
                text: 'Paid in Full',
                color: 'text-green-500',
                bgColor: 'bg-green-50',
                borderColor: 'border-green-500',
                paidAmount: totalAmount,
                remainingBalance: 0
            }
        } else if (appointment.paymentStatus === 'partial') {
            return {
                text: 'Partially Paid',
                color: 'text-orange-500',
                bgColor: 'bg-orange-50',
                borderColor: 'border-orange-500',
                paidAmount: paidAmount,
                remainingBalance: remainingBalance
            }
        } else {
            return {
                text: 'Unpaid',
                color: 'text-red-500',
                bgColor: 'bg-red-50',
                borderColor: 'border-red-500',
                paidAmount: 0,
                remainingBalance: totalAmount
            }
        }
    }

    useEffect(() => {
        if (token) {
            getUserAppointments()
        }
    }, [token])

    return (
        <div>
            <p className='pb-3 mt-12 text-lg font-medium text-white border-b'>My appointments</p>
            <div className=''>
                {appointments.map((item, index) => {
                    const paymentStatusStyle = getPaymentStatus(item)
                    const endTime = calculateEndTime(item.slotTime, item.duration)
                    return (
                        <div key={index} className='grid  gap-4 sm:flex sm:gap-6 py-4 border-b'>
                            
                            <div className='flex-1 text-sm text-white'>
                                <p className='text-white text-base font-semibold'>{item.docData.name}</p>
                                <p>{item.docData.speciality}</p>
                                <p className='mt-2'><span className='text-sm text-white font-medium'>Practitioner:</span> {item.practitioner}</p>
                                <p className='mt-2'><span className='text-sm text-white font-medium'>Booking Number:</span> {item.bookingNumber}</p>
                                <p className='mt-2'><span className='text-sm text-white font-medium'>Date & Time:</span> {slotDateFormat(item.slotDate)} | {item.slotTime} to {endTime} ({item.duration} min)</p>
                                <p className='mt-2'>
                                    <span className='text-sm text-white font-medium'>Total Amount:</span> {currencySymbol}{item.amount}
                                </p>
                            </div>
                            <div className='flex flex-col gap-2 justify-end text-sm text-center text-white'>
                                {/* Payment Status Badge */}
                                <div className={`sm:min-w-48 py-2 border rounded ${paymentStatusStyle.color} ${paymentStatusStyle.bgColor} ${paymentStatusStyle.borderColor}`}>
                                    {paymentStatusStyle.text}
                                </div>

                                {/* Paid Amount */}
                                <p className='text-white'>
                                    Paid: <span className='text-white'>{currencySymbol}{paymentStatusStyle.paidAmount.toFixed(2)}</span>
                                </p>

                                {/* Pay Balance Button for Partial Payments */}
                                {!item.cancelled && item.paymentStatus === 'partial' && !item.isCompleted && (
                                    <button 
                                        onClick={() => handlePayBalance(item)}
                                        className='text-white bg-primary sm:min-w-48 py-2 rounded hover:bg-primary/90 transition-all duration-300'
                                    >
                                        Pay Balance ({currencySymbol}{paymentStatusStyle.remainingBalance.toFixed(2)})
                                    </button>
                                )}

                                {/* Cancel Button */}
                                {!item.cancelled && !item.isCompleted && (
                                    <button 
                                        onClick={() => cancelAppointment(item._id)}
                                        className='text-red-500 border-red-500 border sm:min-w-48 py-2 rounded hover:bg-red-50 transition-all duration-300'
                                    >
                                        Cancel Appointment
                                    </button>
                                )}

                                {/* Completed Status */}
                                {item.isCompleted && (
                                    <button 
                                        className='sm:min-w-48 py-2 border border-green-500 rounded text-green-500'
                                        style={{ cursor: 'default' }}
                                    >
                                        Completed
                                    </button>
                                )}

                                {/* Cancelled Status */}
                                {item.cancelled && !item.isCompleted && (
                                    <button 
                                        className='sm:min-w-48 py-2 border border-red-500 rounded text-red-500'
                                        style={{ cursor: 'default' }}
                                    >
                                        Appointment cancelled
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Payment Confirmation Modal */}
            {showPaymentModal && selectedAppointment && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
                        <h2 className="text-xl font-semibold mb-4">Confirm Payment</h2>
                        <p className="mb-6">
                            You will be redirected to PayFast to complete your payment of {currencySymbol}
                            {(selectedAppointment.amount - selectedAppointment.paidAmount).toFixed(2)}
                        </p>
                        <div className="flex justify-end gap-4">
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="px-4 py-2 text-gray-600 border rounded hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={processPayment}
                                className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
                            >
                                Proceed to PayFast
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default MyAppointments
