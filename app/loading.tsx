import { CircularBarsSpinnerLoader } from '@/components/shared/staggered-loader'

export default function RootLoading() {
  return (
    <main className='flex items-center justify-center min-h-screen w-full'>
      <CircularBarsSpinnerLoader />
    </main>
  )
}
