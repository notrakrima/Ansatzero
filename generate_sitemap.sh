#!/bin/zsh

# Set your website's base URL
BASE_URL="https://www.theisa.ai"
SITEMAP_FILE="sitemap.xml"

# Start the XML structure
echo '<?xml version="1.0" encoding="UTF-8"?>' > $SITEMAP_FILE
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' >> $SITEMAP_FILE

# Get the current date in YYYY-MM-DD format
TODAY=$(date +%Y-%m-%d)

# Find all HTML files, exclude hidden ones, and loop through them
find . -name "*.html" -not -path "*/\.*" | while read file; do
    # Remove the leading ./ from the file path
    clean_path=${file#./}
    
    # Optional: If you want index.html to just be the root URL, uncomment the lines below
    # if [ "$clean_path" = "index.html" ]; then
    #     clean_path=""
    # fi

    echo "  <url>" >> $SITEMAP_FILE
    echo "    <loc>${BASE_URL}/${clean_path}</loc>" >> $SITEMAP_FILE
    echo "    <lastmod>${TODAY}</lastmod>" >> $SITEMAP_FILE
    echo "    <changefreq>weekly</changefreq>" >> $SITEMAP_FILE
    echo "    <priority>0.8</priority>" >> $SITEMAP_FILE
    echo "  </url>" >> $SITEMAP_FILE
done

# Close the XML structure
echo '</urlset>' >> $SITEMAP_FILE

echo "✅ sitemap.xml generated successfully!"
