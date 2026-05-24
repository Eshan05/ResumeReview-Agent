import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { GhostIcon, HomeIcon, MailCheckIcon } from 'lucide-react'
import Link from 'next/link'

export default function NFB() {
  return (
    <div className='flex min-h-[50vh] w-full items-center justify-center bg-background px-4 py-12 lg:px-8'>
      <Card className='relative overflow-hidden border-none bg-gradient-to-br from-background to-muted p-8 shadow-xl'>
        <div className='absolute right-0 top-0 h-32 w-32 rotate-45 bg-gradient-to-br from-primary/20 to-primary/10' />

        <div className='relative z-10 flex flex-col items-center text-center'>
          <div className='mb-4 flex items-center justify-center rounded-full bg-muted p-3'>
            <GhostIcon className='h-12 w-12 text-primary' />
          </div>

          <h1 className='mb-2 text-4xl font-bold tracking-tight'>404</h1>
          <h2 className='mb-4 text-2xl font-semibold'>Page Not Found</h2>
          <p className='mb-8 max-w-md text-muted-foreground text-base'>
            Sorry, we couldn&apos;t find the page you&apos;re looking for.
            Perhaps it&apos;s been moved or no longer exists. If you were
            navigating to an event URL then please confirm that the event is
            still active.
          </p>

          <div className='flex flex-col gap-4 sm:flex-row'>
            <Link href='/' className='w-full sm:w-auto'>
              <Button className='gap-2'>
                <HomeIcon className='h-4 w-4' />
                Back to Home
              </Button>
            </Link>
            <Link
              href='mailto:tpo.rmdssoe@sinhgad.edu'
              className='w-full sm:w-auto'
            >
              <Button variant='outline' className='gap-2'>
                <MailCheckIcon className='h-4 w-4' />
                Contact us
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
