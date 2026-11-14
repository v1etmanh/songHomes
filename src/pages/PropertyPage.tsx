import { Link, useParams } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { MapPin } from 'lucide-react';

import { api } from '../../convex/_generated/api';
import { Spinner } from '../components/Spinner';
import { SongLanding } from '../components/SongLanding';
import { NotFoundPage } from './NotFoundPage';

export function PropertyPage() {
  const { propertySlug } = useParams<{ propertySlug: string }>();
  const property = useQuery(api.properties.bySlug, propertySlug ? { slug: propertySlug } : 'skip');

  if (!propertySlug) return <NotFoundPage />;
  if (property === undefined) return <Spinner label="Loading property…" />;
  if (property === null) return <NotFoundPage />;
  const isSong = property.slug === 'song-homestay';

  if (!isSong) {
    return (
      <div>
        <div className="card mb-8 p-8">
          <h1 className="text-3xl font-semibold text-stone-900">{property.name}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-stone-500">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {property.address}
          </p>
        </div>
        <h2 className="mb-4 text-xl font-semibold text-stone-900">Places to stay</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {property.unitTypes.map((unitType) => (
            <Link key={unitType.unitTypeId} to={`/p/${property.slug}/stay/${unitType.slug}`} className="card p-6">
              <h3 className="text-lg font-semibold">{unitType.name}</h3>
              <p className="mt-2 text-sm text-stone-600">{unitType.description}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return <SongLanding property={property} />;
}
