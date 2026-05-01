
import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://trustlink-pay.vercel.app',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {/* {
      url: 'https://vercel.app',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    }, */}
  ]
}
