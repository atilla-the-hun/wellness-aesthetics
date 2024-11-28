import axios from 'axios'
import React, { useContext, useState } from 'react'
import { TreatmentContext } from '../context/TreatmentContext'
import { AdminContext } from '../context/AdminContext'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'

const Login = () => {
  const navigate = useNavigate()
  const [state, setState] = useState('Admin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const backendUrl = import.meta.env.VITE_BACKEND_URL

  const { setDToken } = useContext(TreatmentContext)
  const { setAToken } = useContext(AdminContext)

  const onSubmitHandler = async (event) => {
    event.preventDefault();

    try {
      if (state === 'Admin') {
        const { data } = await axios.post(backendUrl + '/api/admin/login', { username, password })
        if (data.success) {
          setAToken(data.token)
          localStorage.setItem('aToken', data.token)
          navigate('/admin/dashboard')
        } else {
          toast.error(data.message)
        }
      } else {
        const { data } = await axios.post(backendUrl + '/api/treatment/login', { username, password })
        if (data.success) {
          setDToken(data.token)
          localStorage.setItem('dToken', data.token)
          navigate('/treatment/dashboard')
        } else {
          toast.error(data.message)
        }
      }
    } catch (error) {
      console.error('Login error:', error)
      toast.error(error.response?.data?.message || 'Login failed')
    }
  }

  return (
    <form onSubmit={onSubmitHandler} className='min-h-[80vh] flex items-center'>
      <div className='flex flex-col gap-3 m-auto items-start p-8 min-w-[340px] sm:min-w-96 border rounded-xl text-[#5E5E5E] text-sm shadow-lg'>
        <p className='text-2xl font-semibold m-auto'><span className='text-primary'>{state}</span> Login</p>
        <div className='w-full '>
          <p>Username</p>
          <input onChange={(e) => setUsername(e.target.value)} value={username} className='border border-[#DADADA] rounded w-full p-2 mt-1' type="username" required />
        </div>
        <div className='w-full '>
          <p>Password</p>
          <input onChange={(e) => setPassword(e.target.value)} value={password} className='border border-[#DADADA] rounded w-full p-2 mt-1' type="password" required />
        </div>
        <button className='bg-primary text-white w-full py-2 rounded-md text-base'>Login</button>
        {/* Removed the Treatment Login link */}
      </div>
    </form>
  )
}

export default Login

