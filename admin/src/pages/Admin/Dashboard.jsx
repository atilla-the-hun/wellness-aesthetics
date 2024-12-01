import React, { useContext, useEffect, useState } from 'react'
import { assets } from '../../assets/assets'
import { AdminContext } from '../../context/AdminContext'
import { AppContext } from '../../context/AppContext'

const Dashboard = () => {
  const { getDashData, cancelAppointment, completeAppointment, deleteAppointment, dashData, acceptBalancePayment } = useContext(AdminContext)
  const { slotDateFormat, calculateAge, currency } = useContext(AppContext)
  const [filteredAppointments, setFilteredAppointments] = useState([])
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [totalInvoices, setTotalInvoices] = useState(0)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')

  // Function to calculate end time
  const calculateEndTime = (startTime, duration) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    let totalMinutes = hours * 60 + minutes + duration;
    
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
  }

  // Function to handle printing
  const handlePrint = () => {
    const printContent = document.createElement('div');
    printContent.innerHTML = `
      <style>
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f4f4f4; }
        .header { margin-bottom: 20px; }
        .totals { margin-bottom: 20px; }
        @media print {
          body { padding: 20px; }
        }
      </style>
      <div class="header">
        <h1>Wellness & Aesthetics - Appointments Report</h1>
        <p>Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
      </div>
      <div class="totals">
        <p>Total Bookings: ${currency} ${totalInvoices}</p>
        <p>Total Received: ${currency} ${totalEarnings}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Booking Number</th>
            <th>Client Name</th>
            <th>Treatment</th>
            <th>Practitioner</th>
            <th>Date & Time</th>
            <th>Duration</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${dashData.latestAppointments.map(item => `
            <tr>
              <td>${item.bookingNumber}</td>
              <td>${item.userData.name}</td>
              <td>${item.docData.name}</td>
              <td>${item.practitioner}</td>
              <td>${slotDateFormat(item.slotDate)} ${item.slotTime}</td>
              <td>${item.duration} min</td>
              <td>${currency}${item.amount}</td>
              <td>${item.cancelled ? 'Cancelled' : item.isCompleted ? 'Completed' : 'Active'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.close();
    printWindow.print();
  };

  // Function to handle download
  const handleDownload = () => {
    const headers = [
      'Booking Number',
      'Client Name',
      'Client Email',
      'Client Phone',
      'Treatment',
      'Practitioner',
      'Date',
      'Time',
      'Duration',
      'Amount',
      'Paid Amount',
      'Payment Status',
      'Appointment Status'
    ];

    const csvData = dashData.latestAppointments.map(item => [
      item.bookingNumber,
      item.userData.name,
      item.userData.email,
      item.userData.phone,
      item.docData.name,
      item.practitioner,
      slotDateFormat(item.slotDate),
      `${item.slotTime} - ${calculateEndTime(item.slotTime, item.duration)}`,
      `${item.duration} min`,
      `${currency}${item.amount}`,
      `${currency}${item.paidAmount || 0}`,
      item.paymentStatus,
      item.cancelled ? 'Cancelled' : item.isCompleted ? 'Completed' : 'Active'
    ]);

    const csvContent = [
      headers,
      ...csvData
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `appointments_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to get payment status display
  const getPaymentStatusDisplay = (appointment) => {
    const paidAmount = appointment.paidAmount || 0;
    const totalAmount = appointment.amount || 0;
    const remainingBalance = totalAmount - paidAmount;

    if (appointment.paymentStatus === 'full') {
      return {
        text: 'Paid in Full',
        color: 'text-green-500',
        paidAmount: totalAmount,
        remainingBalance: 0
      }
    } else if (appointment.paymentStatus === 'partial') {
      return {
        text: '50% Paid',
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

  // Function to format payment history
  const formatPaymentHistory = (transactionDetails) => {
    if (!transactionDetails || transactionDetails.length === 0) return 'No payments recorded'
    
    return transactionDetails.map((transaction, index) => (
      <div key={index} className='text-xs mt-1'>
        <span className='text-gray-600'>
          {new Date(transaction.date).toLocaleDateString()} - {currency}{transaction.amount} 
          ({transaction.paymentType === 'full' ? 'Full Payment' : transaction.paymentType === 'partial' ? 'Partial Payment' : 'Balance Payment'})
          {transaction.paymentMethod && ` via ${transaction.paymentMethod}`}
        </span>
      </div>
    ))
  }

  // Function to handle balance payment
  const handleBalancePayment = async () => {
    if (!selectedAppointment) return;

    const success = await acceptBalancePayment(selectedAppointment._id, paymentMethod);
    if (success) {
      setShowPaymentModal(false);
      setSelectedAppointment(null);
      setPaymentMethod('cash');
    }
  }

  useEffect(() => {
    getDashData()
  }, [])

  useEffect(() => {
    if (dashData) {
      const earnings = dashData.latestAppointments.reduce((total, appointment) => total + (appointment.paidAmount || 0), 0)
      const invoices = dashData.latestAppointments.reduce((total, appointment) => total + (appointment.amount || 0), 0)
      setTotalEarnings(earnings)
      setTotalInvoices(invoices)
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
              <p className='text-xl font-semibold text-gray-600'>{dashData.treatments}</p>
              <p className='text-gray-400'>Treatments</p>
            </div>
          </div>
          <div className='flex items-center gap-2 bg-white p-4 min-w-52 rounded border-2 border-gray-100 hover:scale-105 transition-all'>
            <img className='w-14' src={assets.appointments_icon} alt="" />
            <div>
              <p className='text-xl font-semibold text-gray-600'>{dashData.appointments}</p>
              <p className='text-gray-400'>Appointments</p>
            </div>
          </div>
          <div className='flex items-center gap-2 bg-white p-4 min-w-52 rounded border-2 border-gray-100 hover:scale-105 transition-all'>
            <img className='w-14' src={assets.patients_icon} alt="" />
            <div>
              <p className='text-xl font-semibold text-gray-600'>{dashData.patients}</p>
              <p className='text-gray-400'>Clients</p>
            </div>
          </div>
        </div>

        <div className='bg-white mt-5 p-4 rounded border'>
          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4'>
            <div>
              <p className='text-xl font-semibold'>Total Bookings: {currency} {totalInvoices}</p>
              <p className='text-xl font-semibold mt-2'>Received: {currency} {totalEarnings}</p>
              <div className='flex flex-col gap-2 mt-4'>
                <button
                  onClick={handlePrint}
                  className='w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-all flex items-center justify-center gap-2'
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  onClick={handleDownload}
                  className='w-full sm:w-auto px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-all flex items-center justify-center gap-2'
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            </div>
          </div>

          <div className='pt-4 border border-t-0'>
            {dashData.latestAppointments.map((item, index) => {
              const paymentStatusStyle = getPaymentStatusDisplay(item)
              const endTime = calculateEndTime(item.slotTime, item.duration)
              return (
                <div className='flex items-center px-6 py-3 gap-3 hover:bg-gray-100' key={index}>
                  <div className='flex-1 text-sm'>
                    <div className='flex justify-between items-start'>
                      <div>
                        <p className={`px-2 py-1 rounded-full ${paymentStatusStyle.color} ${paymentStatusStyle.bgColor}`}>
                          {paymentStatusStyle.text}
                        </p>
                        <p className='text-gray-800 font-medium'>{item.docData.name}</p>
                        <p className='text-gray-600'>Practitioner: <span className='text-black'>{item.practitioner}</span></p>
                        <p className='text-gray-600'>Booking Number: {<span className='text-black'>{item.bookingNumber}</span>}</p>
                      </div>
                    </div>

                    <div className='mt-4 grid grid-cols-1 gap-4'>
                      <div>
                        <img className='rounded-full w-20' src={item.userData.image} alt="" />
                        <p className='text-gray-600'>Client Name: <span className='text-black'>{item.userData.name}</span></p>
                        <p className='text-gray-600'>Client Email: <span className='text-black'>{item.userData.email}</span></p>
                        <p className='text-gray-600'>Client Telephone: <span className='text-black'>{item.userData.phone}</span></p>
                        <p className='text-gray-600'>Client Age: <span className='text-black'>{calculateAge(item.userData.dob)}</span></p>
                        <p className='text-gray-600'>Booking for: <span className='text-black'>{slotDateFormat(item.slotDate)}, {item.slotTime} to {endTime} ({item.duration} min)</span></p>
                        <p className='text-gray-600 font-medium'>Payment History:</p>
                        {formatPaymentHistory(item.transactionDetails)}
                        {paymentStatusStyle.remainingBalance > 0 && (
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
                        <p className='text-gray-600 mt-1'>
                          Paid: <span className='text-black'>{currency}{paymentStatusStyle.paidAmount.toFixed(2)}</span> / 
                          Total: <span className='text-black'>{currency}{item.amount.toFixed(2)}</span>
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

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96">
            <h2 className="text-xl font-semibold mb-4">Accept Balance Payment</h2>
            <p className="mb-4">
              Amount: {currency}
              {selectedAppointment && (selectedAppointment.amount - selectedAppointment.paidAmount).toFixed(2)}
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
