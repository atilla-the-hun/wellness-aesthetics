import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import validator from "validator";
import mongoose from "mongoose";
import userModel from "../models/userModel.js";
import treatmentModel from "../models/treatmentModel.js";
import appointmentModel from "../models/appointmentModel.js";
import { v2 as cloudinary } from 'cloudinary';
import fetch from 'node-fetch';
import crypto from 'crypto';

// PayPal API Configuration
const PAYPAL_API = 'https://api-m.sandbox.paypal.com';

// PayFast API Configuration
const PAYFAST_API = process.env.PAYFAST_SANDBOX === 'true' 
    ? 'https://sandbox.payfast.co.za'
    : 'https://www.payfast.co.za';

// Function to get PayPal access token
const getPayPalAccessToken = async () => {
    try {
        const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
        const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
            method: 'POST',
            body: 'grant_type=client_credentials',
            headers: {
                Authorization: `Basic ${auth}`,
            }
        });
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('PayPal Access Token Error:', error);
        throw new Error('Failed to get PayPal access token');
    }
};

// Function to generate PayFast signature
const generatePayFastSignature = (data, passPhrase = null) => {
    // Create parameter string
    let pfOutput = '';
    for (let key in data) {
        if(data.hasOwnProperty(key)) {
            if (data[key] !== '') {
                pfOutput +=`${key}=${encodeURIComponent(data[key].trim()).replace(/%20/g, "+")}&`
            }
        }
    }

    // Remove last & from string
    let getString = pfOutput.slice(0, -1);
    if (passPhrase !== null) {
        getString +=`&passphrase=${encodeURIComponent(passPhrase.trim()).replace(/%20/g, "+")}`;
    }

    return crypto.createHash('md5').update(getString).digest('hex');
};

// Function to check PayFast transaction status
const checkPayFastTransactionStatus = async (pfPaymentId) => {
    try {
        // For sandbox testing, always return success since we can't query sandbox transactions
        if (process.env.PAYFAST_SANDBOX === 'true') {
            console.log('Sandbox mode: Assuming payment success');
            return {
                status: 'COMPLETE',
                message: 'Sandbox payment successful'
            };
        }

        // For production
        const queryData = {
            merchant_id: process.env.PAYFAST_MERCHANT_ID,
            merchant_key: process.env.PAYFAST_MERCHANT_KEY,
            pf_payment_id: pfPaymentId,
            timestamp: new Date().toISOString()
        };

        const signature = generatePayFastSignature(queryData, process.env.PAYFAST_PASSPHRASE);
        queryData.signature = signature;

        const queryString = Object.entries(queryData)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');

        const response = await fetch(`${PAYFAST_API}/eng/query/validate?${queryString}`);
        const text = await response.text();

        try {
            return JSON.parse(text);
        } catch (e) {
            console.log('PayFast Response:', text);
            // If we're in sandbox mode or can't parse the response, assume success
            return {
                status: 'COMPLETE',
                message: 'Payment successful'
            };
        }
    } catch (error) {
        console.error('Error checking PayFast transaction:', error);
        // If we're in sandbox mode, assume success
        if (process.env.PAYFAST_SANDBOX === 'true') {
            return {
                status: 'COMPLETE',
                message: 'Sandbox payment successful'
            };
        }
        return null;
    }
};

// Function to update practitioner bookings
const updatePractitionerBookings = async (docId, practitioner, slotDate, slotTime) => {
    try {
        const treatment = await treatmentModel.findById(docId);
        if (!treatment.practitioner_bookings) {
            treatment.practitioner_bookings = {};
        }
        if (!treatment.practitioner_bookings[practitioner]) {
            treatment.practitioner_bookings[practitioner] = {};
        }
        if (!treatment.practitioner_bookings[practitioner][slotDate]) {
            treatment.practitioner_bookings[practitioner][slotDate] = [];
        }
        
        treatment.practitioner_bookings[practitioner][slotDate].push(slotTime);
        await treatment.save();
    } catch (error) {
        console.error('Error updating practitioner bookings:', error);
        throw new Error('Failed to update practitioner bookings');
    }
};

// Function to check if practitioner is available
const isPractitionerAvailable = async (practitioner, slotDate, startTime, duration) => {
    try {
        // Convert start time to minutes since midnight for easier comparison
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const startTimeInMinutes = startHour * 60 + startMinute;
        const endTimeInMinutes = startTimeInMinutes + parseInt(duration);

        // Get all non-cancelled appointments for this practitioner on this date
        const existingAppointments = await appointmentModel.find({
            practitioner,
            slotDate,
            cancelled: false
        });

        // Sort appointments by start time
        existingAppointments.sort((a, b) => {
            const [aHour, aMinute] = a.slotTime.split(':').map(Number);
            const [bHour, bMinute] = b.slotTime.split(':').map(Number);
            return (aHour * 60 + aMinute) - (bHour * 60 + bMinute);
        });

        // Check if the proposed slot would overlap with any existing appointments
        for (const appointment of existingAppointments) {
            const [bookedHour, bookedMinute] = appointment.slotTime.split(':').map(Number);
            const bookedStartTime = bookedHour * 60 + bookedMinute;
            const bookedEndTime = bookedStartTime + appointment.duration;

            // Check if this slot overlaps with the appointment
            if (
                (startTimeInMinutes >= bookedStartTime && startTimeInMinutes < bookedEndTime) ||
                (endTimeInMinutes > bookedStartTime && endTimeInMinutes <= bookedEndTime) ||
                (startTimeInMinutes <= bookedStartTime && endTimeInMinutes >= bookedEndTime)
            ) {
                return false;
            }

            // Check if there's enough break time after previous appointments
            if (startTimeInMinutes >= bookedEndTime && startTimeInMinutes < bookedEndTime + 15) {
                return false;
            }

            // Check if there's enough break time before next appointments
            if (endTimeInMinutes > bookedStartTime - 15 && endTimeInMinutes <= bookedStartTime) {
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error('Error checking practitioner availability:', error);
        throw error;
    }
};

// API to check practitioner availability
const checkPractitionerAvailability = async (req, res) => {
    try {
        const { practitioner, slotDate, slotTime, duration } = req.body;

        if (!practitioner || !slotDate || !slotTime || !duration) {
            return res.json({ success: false, message: 'Missing required fields' });
        }

        const isAvailable = await isPractitionerAvailable(practitioner, slotDate, slotTime, duration);

        res.json({ 
            success: true, 
            available: isAvailable 
        });

    } catch (error) {
        console.error('Error checking practitioner availability:', error);
        res.json({ 
            success: false, 
            message: error.message || 'Failed to check practitioner availability'
        });
    }
};

// API to register user
const registerUser = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password || !phone) {
            return res.json({ success: false, message: 'Missing Details' });
        }

        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" });
        }

        if (password.length < 8) {
            return res.json({ success: false, message: "Please enter a strong password" });
        }

        if (!validator.isMobilePhone(phone, 'any')) {
            return res.json({ success: false, message: "Please enter a valid phone number" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const userData = {
            name,
            email,
            password: hashedPassword,
            phone,
        };

        const newUser = new userModel(userData);
        const user = await newUser.save();
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

        res.json({ success: true, token });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to login user
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: "User does not exist" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
            res.json({ success: true, token });
        } else {
            res.json({ success: false, message: "Invalid credentials" });
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get user profile data
const getProfile = async (req, res) => {
    try {
        const { userId } = req.body;
        const userData = await userModel.findById(userId).select('-password');
        res.json({ success: true, userData });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to update user profile
const updateProfile = async (req, res) => {
    try {
        const { userId, name, phone, address, dob, gender } = req.body;
        const imageFile = req.file;

        if (!name || !phone || !dob || !gender) {
            return res.json({ success: false, message: "Data Missing" });
        }

        await userModel.findByIdAndUpdate(userId, { name, phone, address: JSON.parse(address), dob, gender });

        if (imageFile) {
            const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" });
            const imageURL = imageUpload.secure_url;
            await userModel.findByIdAndUpdate(userId, { image: imageURL });
        }

        res.json({ success: true, message: 'Profile Updated' });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to book appointment 
const bookAppointment = async (req, res) => {
    let session;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        const { userId, docId, slotDate, slotTime, paymentType, practitioner, duration, amount } = req.body;
        
        if (!paymentType || !['full', 'partial'].includes(paymentType)) {
            throw new Error('Invalid payment type. Must be "full" or "partial"');
        }

        if (!duration || !amount) {
            throw new Error('Duration and amount are required');
        }

        // Check treatment availability
        const docData = await treatmentModel.findById(docId).select("-password").session(session);
        if (!docData || !docData.available) {
            throw new Error('Treatment Not Available');
        }

        // Check practitioner availability across all treatments
        const isPractitionerFree = await isPractitionerAvailable(practitioner, slotDate, slotTime, duration);
        if (!isPractitionerFree) {
            throw new Error('Practitioner is not available for this time slot');
        }

        // Get user data
        const userData = await userModel.findById(userId).select("-password").session(session);
        if (!userData) {
            throw new Error('User not found');
        }

        // Generate booking number
        const bookingNumber = await appointmentModel.getNextBookingNumber();
        if (!bookingNumber) {
            throw new Error('Failed to generate booking number');
        }

        // Create appointment with pending payment status
        const appointmentData = {
            userId,
            docId,
            userData,
            docData: { ...docData.toObject(), slots_booked: undefined },
            amount,
            duration,
            slotTime,
            slotDate,
            date: Date.now(),
            bookingNumber,
            paymentStatus: 'none',
            paidAmount: 0,
            practitioner
        };

        const newAppointment = new appointmentModel(appointmentData);
        await newAppointment.save({ session });

        // Update practitioner bookings
        await updatePractitionerBookings(docId, practitioner, slotDate, slotTime);

        await session.commitTransaction();
        res.json({ 
            success: true, 
            message: 'Appointment Created',
            appointmentId: newAppointment._id,
            amount: paymentType === 'full' ? amount : amount / 2
        });

    } catch (error) {
        if (session) {
            await session.abortTransaction();
        }
        console.error('Booking Error:', error);
        res.json({ 
            success: false, 
            message: error.message || 'Failed to book appointment'
        });
    } finally {
        if (session) {
            session.endSession();
        }
    }
};

// API to cancel appointment
const cancelAppointment = async (req, res) => {
    try {
        const { userId, appointmentId } = req.body;
        const appointmentData = await appointmentModel.findById(appointmentId);

        if (appointmentData.userId !== userId) {
            return res.json({ success: false, message: 'Unauthorized action' });
        }

        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true });

        // Remove the booking from practitioner_bookings
        const treatment = await treatmentModel.findById(appointmentData.docId);
        if (treatment.practitioner_bookings?.[appointmentData.practitioner]?.[appointmentData.slotDate]) {
            const bookings = treatment.practitioner_bookings[appointmentData.practitioner][appointmentData.slotDate];
            const updatedBookings = bookings.filter(time => time !== appointmentData.slotTime);
            
            await treatmentModel.findByIdAndUpdate(appointmentData.docId, {
                $set: {
                    [`practitioner_bookings.${appointmentData.practitioner}.${appointmentData.slotDate}`]: updatedBookings
                }
            });
        }

        res.json({ success: true, message: 'Appointment Cancelled' });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to get user appointments for frontend my-appointments page
const listAppointment = async (req, res) => {
    try {
        const { userId } = req.body;
        const appointments = await appointmentModel.find({ userId }).sort({ date: -1 });
        res.json({ success: true, appointments });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// API to make payment of appointment using PayPal
const paymentPayPal = async (req, res) => {
    try {
        const { appointmentId, paymentType } = req.body;
        const { origin } = req.headers;

        const appointmentData = await appointmentModel.findById(appointmentId);

        if (!appointmentData || appointmentData.cancelled) {
            return res.json({ success: false, message: 'Appointment Cancelled or not found' });
        }

        // Calculate payment amount based on payment type and current paid amount
        let paymentAmount;
        if (paymentType === 'full') {
            paymentAmount = appointmentData.paymentStatus === 'none' ? 
                appointmentData.amount : 
                (appointmentData.amount - appointmentData.paidAmount);
        } else {
            paymentAmount = appointmentData.amount / 2;
        }

        // Convert ZAR amount to USD for PayPal
        const usdAmount = (paymentAmount * 0.059).toFixed(2);

        // Get PayPal access token
        const access_token = await getPayPalAccessToken();

        // Create PayPal order
        const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: {
                        currency_code: 'USD',
                        value: usdAmount
                    },
                    description: `${appointmentData.docData.name} - Booking #${appointmentData.bookingNumber}`,
                    custom_id: JSON.stringify({
                        appointmentId: appointmentData._id.toString(),
                        amount: paymentAmount,
                        paymentType
                    })
                }],
                application_context: {
                    brand_name: 'Beauty on the Rocks',
                    landing_page: 'NO_PREFERENCE',
                    user_action: 'PAY_NOW',
                    return_url: `${origin}/verify?success=true&appointmentId=${appointmentData._id}&paypal=true`,
                    cancel_url: `${origin}/verify?success=false&appointmentId=${appointmentData._id}&paypal=true`
                }
            })
        });

        const data = await response.json();
        
        if (data.id) {
            const approveLink = data.links.find(link => link.rel === 'approve');
            res.json({ 
                success: true, 
                order_id: data.id, 
                approve_url: approveLink.href
            });
        } else {
            console.error('PayPal Order Error:', data);
            res.json({ 
                success: false, 
                message: data.message || 'Failed to create PayPal order' 
            });
        }

    } catch (error) {
        console.error('PayPal Payment Error:', error);
        res.json({ success: false, message: error.message });
    }
};

// API to make payment of appointment using PayFast
const paymentPayFast = async (req, res) => {
    try {
        const { appointmentId, paymentType } = req.body;
        const { origin } = req.headers;

        const appointmentData = await appointmentModel.findById(appointmentId);

        if (!appointmentData || appointmentData.cancelled) {
            return res.json({ success: false, message: 'Appointment Cancelled or not found' });
        }

        // Calculate payment amount based on payment type and current paid amount
        let paymentAmount;
        if (paymentType === 'full') {
            paymentAmount = appointmentData.paymentStatus === 'none' ? 
                appointmentData.amount : 
                (appointmentData.amount - appointmentData.paidAmount);
        } else {
            paymentAmount = appointmentData.amount / 2;
        }

        // Store payment details in the appointment for later verification
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            pendingPayment: {
                amount: paymentAmount,
                paymentType,
                timestamp: new Date()
            }
        });

        // Generate a unique payment ID
        const pfPaymentId = `PF_${Date.now()}_${appointmentId}`;

        // Prepare PayFast payment data
        const paymentData = {
            merchant_id: process.env.PAYFAST_MERCHANT_ID,
            merchant_key: process.env.PAYFAST_MERCHANT_KEY,
            return_url: `${origin}/verify?success=true&appointmentId=${appointmentData._id}&payfast=true&pfPaymentId=${pfPaymentId}`,
            cancel_url: `${origin}/verify?success=false&appointmentId=${appointmentData._id}&payfast=true`,
            notify_url: `${origin}/api/user/payfast-notify`,
            name_first: appointmentData.userData.name,
            email_address: appointmentData.userData.email,
            m_payment_id: pfPaymentId,
            amount: paymentAmount.toFixed(2),
            item_name: `${appointmentData.docData.name} - Booking #${appointmentData.bookingNumber}`,
            custom_str1: JSON.stringify({
                appointmentId: appointmentData._id.toString(),
                paymentType,
                amount: paymentAmount
            })
        };

        // Generate signature
        const signature = generatePayFastSignature(paymentData, process.env.PAYFAST_PASSPHRASE);
        paymentData.signature = signature;

        res.json({ 
            success: true,
            paymentData,
            payfast_url: `${PAYFAST_API}/eng/process`
        });

    } catch (error) {
        console.error('PayFast Payment Error:', error);
        res.json({ success: false, message: error.message });
    }
};

// API to verify PayPal payment
const verifyPayPal = async (req, res) => {
    try {
        const { appointmentId, success, token } = req.body;

        if (success === "true" && token) {
            // Get PayPal access token
            const access_token = await getPayPalAccessToken();

            const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${token}/capture`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.status === 'COMPLETED') {
                const customId = data.purchase_units[0].custom_id;
                const customData = JSON.parse(customId);
                
                const appointment = await appointmentModel.findById(appointmentId);
                if (!appointment) {
                    throw new Error('Appointment not found');
                }

                const paymentAmount = parseFloat(customData.amount);
                const currentPaidAmount = appointment.paidAmount || 0;
                const newPaidAmount = currentPaidAmount + paymentAmount;

                // Determine new payment status
                const newPaymentStatus = newPaidAmount >= appointment.amount ? 'full' : 'partial';

                // Update slots_booked only if this is the first payment
                if (appointment.paymentStatus === 'none') {
                    const treatmentData = await treatmentModel.findById(appointment.docId);
                    let slots_booked = treatmentData.slots_booked || {};
                    if (!slots_booked[appointment.slotDate]) {
                        slots_booked[appointment.slotDate] = [];
                    }
                    slots_booked[appointment.slotDate].push(appointment.slotTime);
                    await treatmentModel.findByIdAndUpdate(appointment.docId, { slots_booked });
                }

                // Update appointment with new payment details
                await appointmentModel.findByIdAndUpdate(
                    appointmentId, 
                    {
                        paymentStatus: newPaymentStatus,
                        paidAmount: newPaidAmount,
                        $push: { 
                            transactionDetails: {
                                id: data.id,
                                status: data.status,
                                amount: paymentAmount,
                                paymentType: customData.paymentType,
                                payer: data.payer,
                                date: new Date()
                            }
                        }
                    }
                );

                return res.json({ 
                    success: true, 
                    message: 'Payment Successful',
                    paymentStatus: newPaymentStatus
                });
            }
        }

        res.json({ success: false, message: 'Payment Failed' });

    } catch (error) {
        console.error('PayPal Verification Error:', error);
        res.json({ success: false, message: error.message });
    }
};

// API to verify PayFast payment
const verifyPayFast = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        
        // In sandbox mode, assume payment success
        if (process.env.PAYFAST_SANDBOX === 'true') {
            const appointment = await appointmentModel.findById(appointmentId);
            if (!appointment) {
                return res.json({ success: false, message: 'Appointment not found' });
            }

            const pendingPayment = appointment.pendingPayment;
            if (!pendingPayment) {
                return res.json({ success: false, message: 'No pending payment found' });
            }

            // Calculate new paid amount
            const currentPaidAmount = appointment.paidAmount || 0;
            const newPaidAmount = currentPaidAmount + pendingPayment.amount;

            // Determine new payment status
            const newPaymentStatus = newPaidAmount >= appointment.amount ? 'full' : 'partial';

            // Update slots_booked only if this is the first payment
            if (appointment.paymentStatus === 'none') {
                const treatmentData = await treatmentModel.findById(appointment.docId);
                let slots_booked = treatmentData.slots_booked || {};
                if (!slots_booked[appointment.slotDate]) {
                    slots_booked[appointment.slotDate] = [];
                }
                slots_booked[appointment.slotDate].push(appointment.slotTime);
                await treatmentModel.findByIdAndUpdate(appointment.docId, { slots_booked });
            }

            // Update appointment with new payment details
            await appointmentModel.findByIdAndUpdate(
                appointmentId,
                {
                    paymentStatus: newPaymentStatus,
                    paidAmount: newPaidAmount,
                    pendingPayment: null,
                    $push: {
                        transactionDetails: {
                            id: `SANDBOX_${Date.now()}`,
                            status: 'COMPLETE',
                            amount: pendingPayment.amount,
                            paymentType: pendingPayment.paymentType,
                            date: new Date()
                        }
                    }
                }
            );

            return res.json({ 
                success: true, 
                message: 'Payment verified successfully',
                paymentStatus: newPaymentStatus
            });
        }

        res.json({ success: false, message: 'Payment not completed' });

    } catch (error) {
        console.error('PayFast Verification Error:', error);
        res.json({ success: false, message: error.message });
    }
};

export {
    loginUser,
    registerUser,
    getProfile,
    updateProfile,
    bookAppointment,
    listAppointment,
    cancelAppointment,
    paymentPayPal,
    paymentPayFast,
    verifyPayPal,
    verifyPayFast,
    checkPractitionerAvailability
};
